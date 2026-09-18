import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, type NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { MANIFEST_MAX_AGE_S } from "@growthx/shared/runtime";
import type { Construct } from "constructs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

/** Three separate origins on purpose. The whole product claim is "paste one
 *  snippet into any site" — that only reads as true on video if the customer
 *  site, the dashboard and the CDN are visibly different hosts. */
interface StaticSite {
  bucket: s3.Bucket;
  distribution: cloudfront.Distribution;
}

export class GrowthxStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const ssmPrefix = "/growthx";

    // ── Lambda: API ────────────────────────────────────────────────────────
    const lambdaDefaults: Partial<NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      environment: { GX_SSM_PREFIX: ssmPrefix, NODE_OPTIONS: "--enable-source-maps" },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
        externalModules: ["@aws-sdk/*"],
      },
    };

    const health = new NodejsFunction(this, "HealthFn", {
      entry: path.join(repoRoot, "packages/api/src/handlers/health.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(10),
      // An explicit LogGroup, not `logRetention`: the deprecated prop provisions
      // a custom-resource Lambda on every deploy, which is slow and noisy.
      logGroup: new logs.LogGroup(this, "HealthFnLogs", {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        GX_SSM_PREFIX: ssmPrefix,
        NODE_OPTIONS: "--enable-source-maps",
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
        // The AWS SDK v3 ships inside the Node 20 runtime; bundling it would
        // add megabytes and slow every cold start.
        externalModules: ["@aws-sdk/*"],
      },
    });

    // Read only our own secrets, and only decrypt with the account default key.
    const grantSecrets = (fn: NodejsFunction) => {
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ssm:GetParameter", "ssm:GetParameters"],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter${ssmPrefix}/*`,
          ],
        })
      );
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["kms:Decrypt"],
          resources: ["*"],
          conditions: {
            StringEquals: { "kms:ViaService": `ssm.${this.region}.amazonaws.com` },
          },
        })
      );
    };
    grantSecrets(health);

    // ── HTTP API ───────────────────────────────────────────────────────────
    const api = new apigw.HttpApi(this, "Api", {
      apiName: "growthx-api",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST, apigw.CorsHttpMethod.OPTIONS],
        allowHeaders: ["content-type"],
        maxAge: Duration.days(1),
      },
    });

    api.addRoutes({
      path: "/health",
      methods: [apigw.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("HealthIntegration", health),
    });

    // The manifest sits on the critical render path of every customer page, so
    // it gets more memory (faster cold start) and a tight timeout.
    const manifest = new NodejsFunction(this, "ManifestFn", {
      ...lambdaDefaults,
      entry: path.join(repoRoot, "packages/api/src/handlers/manifest.ts"),
      handler: "handler",
      memorySize: 1024,
      timeout: Duration.seconds(5),
      logGroup: new logs.LogGroup(this, "ManifestFnLogs", {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    grantSecrets(manifest);

    const collect = new NodejsFunction(this, "CollectFn", {
      ...lambdaDefaults,
      entry: path.join(repoRoot, "packages/api/src/handlers/collect.ts"),
      handler: "handler",
      memorySize: 512,
      timeout: Duration.seconds(10),
      logGroup: new logs.LogGroup(this, "CollectFnLogs", {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    grantSecrets(collect);

    api.addRoutes({
      path: "/collect",
      methods: [apigw.HttpMethod.POST, apigw.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration("CollectIntegration", collect),
    });

    api.addRoutes({
      path: "/manifest",
      methods: [apigw.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("ManifestIntegration", manifest),
    });

    // ── Static origins ─────────────────────────────────────────────────────
    // The manifest is fetched before paint on every customer pageview, so it
    // must be served from the edge, not from API Gateway. Without this the
    // round trip is ~300-600ms on a throttled mobile connection — measured — and
    // the snippet's network budget expires before the variant can be applied.
    // Caching on (site, path) is safe precisely because assignment is computed
    // client-side from the visitor id (PLAN.md §9.1); the response is identical
    // for every visitor of a given page.
    const manifestCachePolicy = new cloudfront.CachePolicy(this, "ManifestCache", {
      defaultTtl: Duration.seconds(MANIFEST_MAX_AGE_S),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.seconds(MANIFEST_MAX_AGE_S),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList("site", "path"),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const cdn = this.staticSite("Cdn", {
      // g.js is re-fetched by every visitor; a short TTL is what makes the
      // kill switch take effect in under a minute (PLAN.md §6 P18).
      defaultTtl: Duration.seconds(60),
      cors: true,
    });
    cdn.distribution.addBehavior(
      "/manifest",
      new origins.HttpOrigin(
        `${api.apiId}.execute-api.${this.region}.amazonaws.com`,
        { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY }
      ),
      {
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: manifestCachePolicy,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        compress: true,
      }
    );

    const siteA = this.staticSite("SiteA", { defaultTtl: Duration.minutes(5) });
    const dashboard = this.staticSite("Dashboard", {
      defaultTtl: Duration.minutes(5),
      spa: true,
    });

    // ── Outputs — consumed by scripts/outputs.ts ───────────────────────────
    new CfnOutput(this, "ApiBaseUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "CdnUrl", { value: `https://${cdn.distribution.domainName}` });
    new CfnOutput(this, "SiteAUrl", { value: `https://${siteA.distribution.domainName}` });
    new CfnOutput(this, "DashboardUrl", {
      value: `https://${dashboard.distribution.domainName}`,
    });
    new CfnOutput(this, "CdnBucketName", { value: cdn.bucket.bucketName });
    new CfnOutput(this, "SiteABucketName", { value: siteA.bucket.bucketName });
    new CfnOutput(this, "DashboardBucketName", { value: dashboard.bucket.bucketName });
    new CfnOutput(this, "CdnDistributionId", {
      value: cdn.distribution.distributionId,
    });
    new CfnOutput(this, "SiteADistributionId", {
      value: siteA.distribution.distributionId,
    });
    new CfnOutput(this, "DashboardDistributionId", {
      value: dashboard.distribution.distributionId,
    });
  }

  private staticSite(
    id: string,
    opts: { defaultTtl: Duration; cors?: boolean; spa?: boolean }
  ): StaticSite {
    const bucket = new s3.Bucket(this, `${id}Bucket`, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Hackathon lifetime: we want `cdk destroy` to actually clean up.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const responseHeaders = new cloudfront.ResponseHeadersPolicy(
      this,
      `${id}Headers`,
      {
        // Deterministic CORS at the edge. Relying on S3 CORS instead would mean
        // forwarding the Origin header and fragmenting the cache.
        corsBehavior: opts.cors
          ? {
              accessControlAllowOrigins: ["*"],
              accessControlAllowHeaders: ["*"],
              accessControlAllowMethods: ["GET", "HEAD", "OPTIONS"],
              accessControlAllowCredentials: false,
              accessControlMaxAge: Duration.days(1),
              originOverride: true,
            }
          : undefined,
        securityHeadersBehavior: {
          contentTypeOptions: { override: true },
          referrerPolicy: {
            referrerPolicy:
              cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
        },
      }
    );

    const cachePolicy = new cloudfront.CachePolicy(this, `${id}Cache`, {
      defaultTtl: opts.defaultTtl,
      minTtl: Duration.seconds(0),
      maxTtl: Duration.days(1),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const distribution = new cloudfront.Distribution(this, `${id}Distribution`, {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy,
        responseHeadersPolicy: responseHeaders,
        compress: true,
      },
      // A client-routed dashboard must serve index.html for unknown paths.
      errorResponses: opts.spa
        ? [
            { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
            { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
          ]
        : undefined,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    return { bucket, distribution };
  }
}
