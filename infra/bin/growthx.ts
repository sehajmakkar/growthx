#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { GrowthxStack } from "../lib/growthx-stack.js";

const app = new App();

new GrowthxStack(app, "GrowthxStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  description:
    "GrowthX — AI growth engineer. Snippet CDN, customer site, dashboard, and API.",
});
