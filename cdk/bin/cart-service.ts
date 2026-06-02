#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { CartServiceStack } from '../lib/cart-service-stack';

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = new cdk.App();
new CartServiceStack(app, 'CartServiceStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
