import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';
import * as path from 'path';
import { execSync } from 'child_process';
import { cpSync } from 'fs';

export class CartServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const dbPassword = process.env.DB_PASSWORD;
    if (!dbPassword) throw new Error('DB_PASSWORD env var is required');

    const appRoot = path.join(__dirname, '../..');

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', { isDefault: true });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Allow PostgreSQL access',
      allowAllOutbound: true,
    });
    dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432));

    const dbInstance = new rds.DatabaseInstance(this, 'CartDB', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publiclyAccessible: true,
      securityGroups: [dbSecurityGroup],
      databaseName: 'cart_db',
      credentials: rds.Credentials.fromPassword(
        'postgres',
        cdk.SecretValue.unsafePlainText(dbPassword),
      ),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    const cartLambda = new lambda.Function(this, 'CartLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'lambda.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_PORT: dbInstance.dbInstanceEndpointPort,
        DB_NAME: 'cart_db',
        DB_USERNAME: 'postgres',
        DB_PASSWORD: dbPassword,
        DB_SSL: 'true',
        NODE_ENV: 'production',
      },
      code: lambda.Code.fromAsset(appRoot, {
        bundling: {
          local: {
            tryBundle(outputDir: string): boolean {
              try {
                execSync('npm run build', { cwd: appRoot, stdio: 'inherit' });
                cpSync(path.join(appRoot, 'dist'), outputDir, { recursive: true });
                cpSync(path.join(appRoot, 'package.json'), path.join(outputDir, 'package.json'));
                cpSync(path.join(appRoot, 'package-lock.json'), path.join(outputDir, 'package-lock.json'));
                execSync('npm ci --omit=dev', { cwd: outputDir, stdio: 'inherit' });
                return true;
              } catch {
                return false;
              }
            },
          },
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            [
              'npm ci',
              'npm run build',
              'cp -r dist/* /asset-output/',
              'cp package.json package-lock.json /asset-output/',
              'cd /asset-output && npm ci --omit=dev',
            ].join(' && '),
          ],
        },
      }),
    });

    const api = new apigateway.LambdaRestApi(this, 'CartApi', {
      handler: cartLambda,
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['*'],
      },
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Cart Service API URL',
    });

    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
      description: 'RDS endpoint for DBeaver connection',
    });
  }
}
