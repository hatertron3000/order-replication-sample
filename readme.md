# BigCommerce Order Replication Service Starter Kit
BigCommerce stores generate new ecommerce orders, but what happens from there? Do you need to replicate that order into another system like an ERP? If so, you may be in the right place.

This sample application uses the [AWS CloudFormation](https://aws.amazon.com/cloudformation/) template in `cloudformation/stack.json` to deploy serverless resources that...
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

## Summary
Configure the order replication sample app to poll your BigCommerce store for new orders at regular intervals (minimum: 15 minutes, maximum: 24 hours) and store them in DynamoDB. Extend this application with your own triggers and lambda functions to do things with those orders, like loading them into an OMS or CRM.

> :warning: **Consider PII and Privacy**
>
> This sample app will store all order data including personally identifiable information in addresses in your AWS account. Be mindful of privacy regulations and consider modifying the function in `lambda/process-new-orders` to filter out unnecessary information or pass the orders to another datastore instead of DynamoDB.
>
> This application does not ingest store or transmit PCI-sensitive data like credit card or bank account numbers.

New orders are identified by order status. By default, all orders in Awaiting Fulfillment, Awaiting Payment, or Completed states will be retrieved. To modify the allowed status IDs, add or remove status IDs from `allowedStatusIds` in `lambda/get-new-orders/index.js`.

Once the order is processed and stored, the order replication service will update the status in BigCommerce. By default, the new order status is Awaiting Shipment (status_id: 9) unless the order only contains digital products in which case the order is placed into the Awaiting Pickup state (status_id: 8) which may be relabeled in BigCommerce to something like "Digital Order Complete" which more appropriately describes the order state.

The service also exposes an API which can receive the _store/cart/converted_ [webhook event](https://developer.bigcommerce.com/api-docs/getting-started/webhooks/about-webhooks) from BigCommerce to trigger the same processing as the regular poll. To prevent the possibility of lost events due to a configuration or connectivity issue between the order replication service and BigCommerce, it is a good idea to continue to poll for new orders as a backup in case of missed webhooks. But, to mitigate the possibility of orders being processed multiple times when using webhooks and polling, configure the polling interval to be longer (e.g. 24 hours) and schedule polls to run at low-traffic times.


## Setup
Regardless of your chosen deployment option, you will need to create an S3 bucket to store the lambda deployment packages, and you will need to generate BigCommerce API credentials. Once you have completed these setup steps, choose deployment option 1 or option 2. If you want to set up continuous deployment from your Github repo to your AWS account, use option 1. If you prefer to manually upload the CloudFormation template, skip to option 2.

##### Create an S3 bucket
The build scripts upload Lambda deployment packages to an S3 bucket which CloudFormation will use to deploy the Lambda functions. The creation of the deployment bucket is not automated (yet, see issue #4), so you must first create one using the AWS console, CLI, or SDK. You may configure versioning and logging as you see fit, and the bucket should block all public access.

##### Generate API Tokens for your Staging BigCommerce Store
The sample app will read orders and modify order states in your BigCommerce store. Additionally, the sample app includes workflows that, if the continuous deployment option is utilized, deploy to three different environments depending on the branch name (dev, staging, master). That means that you should have at least two BigCommerce environments (i.e. stores): one for staging, and one for prod. At a minimum, do not integrate this service with your production store until you have thoroughly tested it against your use cases in a staging or dev environment. 

In your staging store, create API tokens: https://support.bigcommerce.com/s/article/Store-API-Accounts

The tokens require the **Modify Orders** scope.

##### Prepare Some Order Data
Place a few test orders in your store so your app has some data to work with. Make sure your orders are in a "new" state, meaning one of the states that BigCommerce will use for a new order with a successful authorization. Consider the following scenarios:

- The order is in **Awaiting Fulfillment** state because a shopper completed checkout with a payment method that is configured to both authorize and capture payment at checkout.
- The order is in **Completed** state because a shopper completed checkout with a payment method that is configured to both authorize and capture payment at checkout, and the shopper's cart contained only digital products.
- The order is in **Awaiting Payment** state because a shopper completed checkout with a payment method that is configured to authorize but not capture payment at checkout, or with an offline payment method.

## Installation
### Deployment Option 1
#### Continuous deployment with Github actions
##### Create the IAM user
Create an IAM user with permissions, or assign it to a group with permissions, to deploy the CloudFormation stack. The user will need programmatic access via the AWS CLI, but does not need access to the console. It will need permissions to perform all of the create, update, and delete actions on the AWS resources in your stack.

> :warning: **Always use IAM best practices**
>
> These example policies, while not unrestricted, allows a wide range of actions on any resource in your account including other policies and roles. Consider refining this example, updating the workflows to use different IAM users/groups/roles, and/or improving on the IAM roles/policies defined in the CloudFormation template. Please submit PRs with better IAM! :heart:
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

##### Set up the repo
Create a new empty repo on Github: https://github.com/new

Configure the secrets that the deployment workflows will use under _Settings > Secrets_:

- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION
- S3_BUCKET_STAGING
- BIGCOMMERCE_CLIENT_ID_STAGING
- BIGCOMMERCE_STORE_HASH_STAGING
- BIGCOMMERCE_TOKEN_STAGING
- EXCEPTIONS_EMAIL_ADDRESS_STAGING


##### Clone the sample, then push it to the Staging branch
Replace `<YOUR_GITHUB_USERNAME>` and `<your-repo-name>` then run the following commands:
```
git clone https://github.com/hatertron3000/order-replication-sample
cd order-replication-sample
git remote rm origin
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<your-repo-name>.git
git checkout -b staging
git push -u origin staging
```

These commands will clone the sample app, remove the origin, add your repository as the origin, then publish a new branch named _staging_. 

##### Magic
After making you push your staging branch, Github will execute the workflow in `.github/workflows/staging_deploy.yml`. To check the workflow status, watch job progress, and review logs, navigate to _Actions_ in your repo:  `https://github.com/<YOUR-GITHUB-USERNAME>/<your-repo-name>/actions`

When the _build (12.x)_ job in the Deploy to Staging workflow gets to the _Deploy to AWS CloudFormation_ step, you can watch the stack creation progress and review logs in your AWS CloudFormation console.

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

##### Testing
To test your service, you may either wait for the initial poll or trigger a poll from the Lambda console. To trigger a poll:

1. Navigate to the Lambda service in the AWS console
2. Click the name of the GetNewOrders function (e.g. OrderReplication-staging-GetNewOrders)
3. Click the events dropdown next to the _Test_ button, then click _Configure test events_
4. Select the _Amazon Cloudwatch_ template named _cloudwatch-scheduled-event_
5. Enter a name like "Cloudwatch" for the test event
6. Click the _Create_ button
7, Click the _Test_ button

If the test is successful, the execution logs should indicate 0 or more orders were added to the queue, there should be a new entry in the Jobs table in DynamoDB, and you should begin to see any new orders in the Orders table in DynamoDB.

##### Moving to Production
When you are ready to integrate your service with your production BigCommerce store, configure the following secrets in the Github repository before merging the staging branch with master:

- BIGCOMMERCE_CLIENT_ID_PROD
- BIGCOMMERCE_STORE_HASH_PROD
- BIGCOMMERCE_TOKEN_PROD
- EXCEPTIONS_EMAIL_ADDRESS_PROD
- S3_BUCKET_PROD

After creating your master branch, be sure to configure your repository's branch settings to use master as the default branch.

### Deployment Option 2
#### Deploy from the CloudFormation Console
##### Build and Upload Lambda Deployment Packages to S3
The sample app comes with bash scripts to generate .zip files for each lambda function and add them to the `build` directory in your project. To run the build scripts, execute the following command in your project folder:

```
sh scripts/build.sh
```

You may then manually upload the .zip files in `build/` to your S3 deployment bucket.

If you have the AWS CLI installed and configured with PutObject access to your S3 bucket, you may alternatively run `sh scripts/upload.sh <YOUR_S3_BUCKET>` to create the deployment packages and upload them.

If your development environment does not support bash or you prefer to manually create the deployment packages, first run `npm install` in each of the folders in the `lambda` directory to install dependencies before creating a .zip file with the contents of each of those folders. Those files must be named `get-new-orders`, `new-orders-webhook`, and `process-new-orders` respectively. Make sure not to include the top-level folders in your .zip files, just the folder contents.

Example: 
 ```
get-new-orders.zip
└ node_modules
└ index.js
└ package.json
└ package-lock.json
```

Upload each .zip file to the S3 bucket you created during the setup steps.

##### Deploy the Stack from the CloudFormation Console
1. In the AWS console, navigate to the CloudFormation service.
2. Select the options to create a stack with new resources.
3. Choose the option to upload a template file, then upload `cloudformation/stack.json`.
4. Click _Next_, then enter values for the stack name and parameters including:
- BigCommerceClientId
- BigCommerceStoreHash
- BigCommerceToken
- ExceptionsEmailAddress
- LambdaDeploymentPackagesBucketName
- PollingInterval
- StageName
5. Click _Next_, then choose an IAM role or allow CloudFormation to use your current IAM user by leaving the role name blank
6. Click _Next_, then click the checkbox to acknowledge that the stack will create IAM policies and roles.
7. Click _Create Stack_, then watch events log as the resources are deployed

## Optional Webhook Configuration
To configure the webhook, first retrieve the URL for your API. To retrieve the URL from the AWS console:

1. Navigate to the API Gateway console
2. From the list or APIs, click your API name (e.g. OrderReplication-staging-Webhooks)
3. Click _Stages_, then expand your stage name (e.g. staging or prod)
4. Click the _POST_ method under _/cart-converted_
5. Copy the Invoke URL (e.g. https://\<API-ID>.execute-api.\<REGION>.amazonaws.com/\<STAGE-NAME>/cart-converted)

Use the URL to create a webhook by sending a POST request to the [BigCommerce Webhooks API](https://developer.bigcommerce.com/api-reference/webhooks/webhooks/createwebhooks) at `https://api.bigcommerce.com/stores/<STORE_HASH>/v2/hooks` with the following headers and body:
```
X-Auth-Client: <YOUR_BIGCOMMERCE_CLIENT_ID>
X-Auth-Token: <YOUR_BIGCOMMERCE_API_TOKEN>
Content-Type: application/json
Accept: application/json

{
    "scope": "store/cart/converted",
    "destination": "<YOUR_API_URL>",
    "is_active": true
}
```

> :warning: **Keep track of your API credentials**
>
> BigCommerce webhooks may only be viewed, modified, or deleted by requests that use the same API credentials that were used to create the webhook. If you lose the credentials that were used to create this webhook, you will not be able to disable, re-enable, or modify the hook. You will still be able to create a new webhook with new credentials.

Once your webhook is active, BigCommerce will begin sending events to your API whenever a shopper completes checkout successfully and the function in `lambda/new-orders-webhook/index.js` will retrieve the orders for processing.

#### Testing the Webhook

To test the webhook, send a POST request to your API with the following body or similar values:

```
{
    "created_at": 1593326572,
    "store_id": "1234567890",
    "producer": "stores/<YOUR_STORE_HASH>",
    "scope": "store/cart/converted",
    "hash": "d4b69b09122a4385b9e5af02e752f96d20235330",
    "data": {
        "type": "cart",
        "id": "72880ea0-43ec-411c-aefd-d2dba47b6552",
        "orderId": 100
    }
}
```

Review the Cloudwatch logs for the CartConvertedWebhookFunction Lambda function for the results. If the webhook is processed successfully, you should see a new item in the Webhooks table in DynamoDB, and the order should be added to the Orders table in DynamoDB.

## Architecture
![Architecture Diagram](readme_assets/architecture.png)
_Not pictured: IAM, API Gateway Resources/Methods/Stages_

### Resources Utilized
The order replication sample app is composed of the following AWS resources:
- 3 DynamoDB Tables
- 3 Lambda Functions
- 2 SQS Queues
- 1 API Gateway with a single resource, Method, Stage, & Deployment
- 1 EventBridge Event
- 1 CloudWatch Alarm
- 2 SNS Topics & Subscriptions
- IAM Policies and Roles
- Cloudwatch Logs

### Summary
A scheduled rule in EventBridge will invoke the function in `lambda/get-new-orders/index.js` to poll for new orders. You may configure the polling interval for each environment in the deployment workflows found in `.github/workflows`, or manually via the CloudFormation console. The function will query the [Get Order Count](https://developer.bigcommerce.com/api-reference/store-management/orders/orders/getcountorder) and [Get All Orders](https://developer.bigcommerce.com/api-reference/store-management/orders/orders/getallorders) endpoints for orders in the stated defined in `allowedStatusIds`. The function will submit a message to the Orders SQS queue for processing, and log the order ID in Cloudwatch Logs. After all new orders are submitted to the queue, the function will store information about the job in the Jobs table in DynamoDB. If there is an error caught by the function, an SNS message will be published to the Application Errors SNS topic which triggers an email to the email address configured during deployment.

The API gateway proxies events to the lambda function in `lambda/new-orders-webhook/index.js`. If BigCommerce is configured to publish webhook events to the API gateway, the lambda function will retrieve the order ID from the webhook events and use it to retrieve the order from the [Get an Order](https://developer.bigcommerce.com/api-reference/store-management/orders/orders/getanorder) API. The function publishes the order to the Orders SQS queue for processing. Then, the function stores the webhook in DynamoDB. If there is an error caught by the function, an SNS message will be published to the Application Errors SNS topic which triggers an email to the email address configured during deployment.

The Orders SQS queue is the event source for the lambda function in `lambda/process-new-orders/index.js`. The function is configured to run at a maximum concurrency of 3 to prevent exceeding the API concurrency limit. You may configure the concurrency in the CloudFormation template as `Resources.ProcessOrdersFunction.PropertiesReservedConcurrentExecutions`. The Orders queue is configured to allow 20 receive attempts before orders are put into the dead letter queue. You may configure the retry attempts in the CloudFormation template as `Resources.OrdersQueue.Properties.RedrivePolicy.maxReceiveCount`. If an order fails to be removed from the queue after 20 retrieval attempts, the order will be placed in the Orders Dead Letter Queue. A Cloudwatch alarm will trigger and publish a message to the Order Dead Letter Queue SNS Topic if at least one order is visible in the dead letter queue for more than one minute.

Once the function retrieves an order from the Order queue, it will query the [Order Products](https://developer.bigcommerce.com/api-reference/store-management/orders/order-products/getallorderproducts), [Order Shipping Addresses](https://developer.bigcommerce.com/api-reference/store-management/orders/order-shipping-addresses/getallshippingaddresses), and [Order Coupons](https://developer.bigcommerce.com/api-reference/store-management/orders/order-coupons/getallordercoupons) subresources, then transform the responses into a single object before storing the data in DynamoDB. The function then uses the [Update an Order](https://developer.bigcommerce.com/api-reference/store-management/orders/orders/updateanorder) API to set the order status according to the `newPhysicalOrderStatusId` and `newDigitalOrderStatusId` values defined in the function. Once the order status is updated, the function removes the message from the Orders queue.