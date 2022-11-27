#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PortfolioSiteCdkStack } from '../lib/portfolio-site-cdk-stack';

const app = new cdk.App();
new PortfolioSiteCdkStack(app, 'PortfolioSiteCdkStack', {
  env: {
    account: '',
    region: 'eu-central-1',
  }
});
app.synth();