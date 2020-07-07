# BigCommerce Order Replication Service Starter Kit
BigCommerce stores generate new ecommerce orders, but what happens from there? Do you need to replicate that order into another system like an ERP? If so, you may be in the right place.

This sample application uses the [AWS Cloudformation](https://aws.amazon.com/cloudformation/) template in `cloudformation/stack.json` to deploy serverless resources that...
- ...query BigCommerce v2 Order APIs to find orders in the Awaiting Fulfillment, Awaiting Payment, and Completed (for digital orders) states in your BigCommerce store at intervals from every 15 minutes to once per day.
- ...expose an API that may receive a store/cart/converted webhook from BigCommerce to retrieve new orders in near-real time.
- ...query BigCommerce v2 Order APIs to retrieve the subresources like products, shipping addresses, and coupons.
- ...store the order data in DynamoDB.
- ...update the order status to Awaiting Shipment in BigCommerce.
- ...publish email alerts when an order poll or webhook processing fails.
- ...publish email alerts when an order ends up in the dead letter queue.

This repo includes workflow files in `.github/workflows` to trigger [Github actions](https://github.com/features/actions) that, upon merging new code, will...
- ...install dependencies for each lambda function.
- ...compress each lambda function into a .zip deployment package.
- ...upload the deployment package to an S3 bucket.
- ...deploy the cloudformation template to a dev, staging or prod environment on AWS depending on the branch receiving the merge.

## Setup and Installation
### Installation Option 1
#### Continuous deployment with Github actions
##### Create an S3 bucket
The build scripts upload Lambda deployment packages to an S3 bucket which Cloudformation will use to deploy the Lambda functions. The creation of the deployment bucket is not automated (yet, see issue #4), so you must first create one using the AWS console, CLI, or SDK. You may configure versioning and logging as you see fit, and the bucket should block all public access.

##### Create the IAM user
Create an IAM user with permissions, or assign it to a group with permissions, to deploy the Cloudformation stack. The user will need programmatic access via the AWS CLI, but does not need access to the console. It will need permissions to perform all of the create, update, and delete actions on the AWS resources in your stack.

> :warning: **Always use IAM best practices**
> These example policies, while not unrestricted, allows a wide range of actions on any resource in your account including other policies and roles. Consider refining this example, updating the workflows to use different IAM users/groups/roles, and/or improving on the IAM roles/policies defined in the Cloudformation template. Please submit PRs with better IAM! :heart:
```

Consider starting with the following AWS managed policies:
- AmazonS3FullAccess
- AWSCloudFormationFullAccess

and this example policy:

{
  "Version": "2012-10-17",
  "Statement": [
     {
      "Effect": "Allow",
      "Action": [
        "iam:CreatePolicy",
        "iam:CreateRole",
        "iam:GetPolicy",
        "iam:ListPolicyVersions",
        "iam:DeletePolicy",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PassRole",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicyVersion"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:ListTagsOfResource",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:UpdateTable",
        "dynamodb:UpdateTimeToLive"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "sns:ListSubscriptionsByTopic",
        "sns:ListTopics",
        "sns:Subscribe",
        "sns:Unsubscribe",
        "sns:CreateTopic",
        "sns:DeleteTopic",
        "sns:GetTopicAttributes"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "apigateway:*"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "lambda:AddPermission",
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:InvokeFunction",
        "lambda:RemovePermission",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:PutFunctionConcurrency",
        "lambda:CreateEventSourceMapping",
        "lambda:DeleteEventSourceMapping",
        "lambda:GetEventSourceMapping"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "events:DeleteRule",
        "events:DescribeRule",
        "events:DisableRule",
        "events:EnableRule",
        "events:PutRule",
        "events:PutTargets",
        "events:RemoveTargets"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:CreateQueue",
        "sqs:DeleteQueue",
        "sqs:GetQueueAttributes",
        "sqs:AddPermission",
        "sqs:RemovePermission",
        "sqs:SetQueueAttributes"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Sid": "Stmt1593982265000",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:DescribeAlarms",
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:DeleteAlarms"
      ],
      "Resource": [
        "*"
      ]
    }
  ]
}
```

Store the Access Key and Secret Access Key for your AWS user securely. You will need them later when you configure the deployment pipeline. For more information on creating IAM users, see the AWS documentation: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html

##### Generate API Tokens for your Staging BigCommerce Store
The sample app includes workflows that deploy to three different environments depending on the branch name (dev, staging, master). The installation instructions will walk you through configuring your staging environment first, then merging to master and deploying to prod when you are ready. That means that you should have at least two BigCommerce environments (i.e. stores): one for staging, and one for prod.

In your staging store, create API tokens: https://support.bigcommerce.com/s/article/Store-API-Accounts

The tokens require the **Modify Orders** scope.

Place a few test orders so your app has some data to work with. Make sure your orders are in a "new" state, meaning one of the states that BigCommerce will use for a new order with a successful authorization. Consider the following scenarios:

- The order is in **Awaiting Fulfillment** state because a shopper completed checkout with a payment method that is configured to both authorize and capture payment at checkout.
- The order is in **Completed** state because a shopper completed checkout with a payment method that is configured to both authorize and capture payment at checkout, and the shopper's cart contained only digital products.
- The order is in **Awaiting Payment** state because a shopper completed checkout with a payment method that is configured to authorize but not capture payment at checkout, or with an offline payment method.

##### Set up the repo
Create a new empty repo on Github: https://github.com/new

Configure the secrets that the deployment workflows will use under _Settings > Secrets_:

- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- BIGCOMMERCE_CLIENT_ID_STAGING
- BIGCOMMERCE_STORE_HASH_STAGING
- BIGCOMMERCE_TOKEN_STAGING
- EXCEPTIONS_EMAIL_ADDRESS_STAGING
- S3_BUCKET_STAGING

##### Clone the sample, then push it to the Staging branch
Replace `<YOUR_GITHUB_USERNAME>` and `<your-repo-name>` then run the following commands:
```
git clone https://github.com/hatertron3000/order-replication-sample
cd order-replication-sample
git remote rm origin
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<your-repo-name>.git
git push -u origin staging
```

##### Magic
After making your initial commit to the staging branch, Github will execute the workflow in `.github/workflows/staging_deploy.yml`. To check the workflow status, watch job progress, and review logs, navigate to _Actions_ in your repo:  `https://github.com/<YOUR-GITHUB-USERNAME>/<your-repo-name>/actions`

When the _build (12.x)_ job in the Deploy to Staging workflow gets to the _Deploy to AWS CloudFormation_ step, you can watch the stack creation progress and review logs in your AWS Cloudformation console.

If the service deployed properly, you should now have a Cloudwatch rule configured to poll for new orders every 2 hours. You may modify the `POLLING_INTERVAL` in the deployment job environment's yml file in `.github/workflows` to be any of the following values:

```
        "PollingInterval": {
            "Type": "Number",
            "AllowedValues": [
                15,
                30,
                60,
                120,
                240,
                480,
                1440
            ]
```

You can modify the acceptable values in the cloudformation template.

##### Moving to Production
When you are ready to integrate your service with your production BigCommerce store, configure the following secrets in the Github repository before merging the staging branch with master:

- BIGCOMMERCE_CLIENT_ID_PROD
- BIGCOMMERCE_STORE_HASH_PROD
- BIGCOMMERCE_TOKEN_PROD
- EXCEPTIONS_EMAIL_ADDRESS_PROD
- S3_BUCKET_PROD

### Installation Option 2
#### Semi-automated deployment with Cloudformation console
TODO

### Optional Webhook Configuration
TODO

## Architecture
TODO DIAGRAM
TODO SUMMARY