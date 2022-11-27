import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { CodeBuildAction, GitHubSourceAction, GitHubTrigger } from 'aws-cdk-lib/aws-codepipeline-actions';
import { AnyPrincipal, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BuildSpec, Project } from 'aws-cdk-lib/aws-codebuild';

export class PortfolioSiteCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'siteUserData', {
      partitionKey: {name: 'id', type: dynamodb.AttributeType.NUMBER},
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const updateTable = new lambda.Function(this, 'updateTable', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'update.handler',
      code: lambda.Code.fromAsset('api'),
      environment: {
        TABLE_NAME: table.tableName
      }
    });

    table.grantWriteData(updateTable);

    const updateAPI = new apigw.LambdaRestApi(this, 'updateApi', {
      handler: updateTable,
      proxy: false,
      defaultCorsPreflightOptions: {
        allowHeaders: ['*'],
        allowMethods: apigw.Cors.ALL_METHODS,
        allowOrigins: apigw.Cors.ALL_ORIGINS
      }
    });
    const method = updateAPI.root.addResource('post');
    method.addMethod('POST');

    const bucket = new s3.Bucket(this, 'siteBucket', {
      websiteIndexDocument: "index.html",
      bucketName: "narhi.dev",
      publicReadAccess: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    bucket.addToResourcePolicy(
      new PolicyStatement({
        resources: [
          "arn:aws:s3:::narhi.dev/*",
        ],
        actions: ["s3:GetObject"],
        principals: [new AnyPrincipal],
        conditions: {
          'IpAddress': {
            'aws:SourceIp': [
              '103.21.244.0',
              '103.22.200.0',
              '103.31.4.0',
              '104.16.0.0',
              '104.24.0.0',
              '108.162.192.0',
              '131.0.72.0',
              '141.101.64.0',
              '162.158.0.0',
              '172.64.0.0',
              '173.245.48.0',
              '188.114.96.0',
              '190.93.240.0',
              '197.234.240.0',
              '198.41.128.0'
            ]
          }
        }
      })
    );

    new s3deploy.BucketDeployment(this, 'deployWebsite', {
      sources: [s3deploy.Source.asset('./build')],
      destinationBucket: bucket,
    });

    /* CI/CD PIPELINE FOR SITE DEPLOYMENT */
    const pipeline = new Pipeline(this, 's3Pipeline', {
      pipelineName: 'sitePipeline',
    });
    const sourceStage = pipeline.addStage({
      stageName: 'Source',
    });
    const buildStage = pipeline.addStage({
      stageName: 'Build',
      placement: {
        justAfter: sourceStage
      }
    });
    const sourceOutput = new Artifact()
    const sourceAction = new GitHubSourceAction({
      actionName: 'GitHub',
      owner: 'Walaska',
      repo: 'walas-site',
      oauthToken: cdk.SecretValue.secretsManager('github-token'),
      output: sourceOutput,
      branch: 'main',
      trigger: GitHubTrigger.POLL
    });
    sourceStage.addAction(sourceAction);
    const role = new Role(this, 'pipelineRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        ManagedPolicy.fromAwsManagedPolicyName('CloudFrontFullAccess')
      ]
    });
    const codeBuild = new Project(this, 'codeBuild', {
      role,
      buildSpec: BuildSpec.fromObject({
        "version": 0.2,
        "phases": {
          "install": {
            "runtime-versions": {
              "nodejs": 10
            },
            "commands": [
              "npm ci",
              "pip install awscli --upgrade --user"
            ]
          },
          "build": {
            "commands": [
              "npm run build",
            ],
            "artifacts": {
              "files": [
                "**/*"
              ],
              "base-directory": 'build'
            }
          },
          "post_build": {
            "commands": [
              `aws s3 rm s3://narhi.dev/ --recursive`,
              `aws s3 cp ./build s3://narhi.dev/ --recursive --grants read=uri=http://acs.amazonaws.com/groups/global/AllUsers`
            ]
          }
        }
      })
    });
    const buildAction = new CodeBuildAction({
      actionName: 'Build',
      input: sourceOutput,
      project: codeBuild
    });

    buildStage.addAction(buildAction);
  }
}
