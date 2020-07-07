const AWS = require('aws-sdk')
const BigCommerce = require('node-bigcommerce')
const dyanamoDbClient = new AWS.DynamoDB.DocumentClient()
const sqsClient = new AWS.SQS()
const bigCommerce = new BigCommerce({
    logLevel: 'info',
    clientId: process.env.CLIENT_ID,
    accessToken: process.env.TOKEN,
    storeHash: process.env.STORE_HASH,
    responseType: 'json',
    apiVersion: 'v2'
})


const getBigCommerceRetry = async (resource, n) => {
    // Default max attempts is 3
    n = n ? n : 3
    try {
        return await bigCommerce.get(resource)
    } catch (err) {
        if (n === 1) throw err
        return await getBigCommerceRetry(resource, n - 1)
    }
}

exports.handler = async (event, context) => {
    let response = {
        statusCode: 500,
        body: JSON.stringify('Something went wrong'),
    }
    try {
        const webhook = event.body ? JSON.parse(event.body) : event
        if (webhook.scope !== 'store/cart/converted' || webhook.producer !== `stores/${process.env.STORE_HASH}`) {
            response = {
                statusCode: 403,
                body: JSON.stringify('Unauthorized'),
            }
            return response
        }
        console.log('Processing webhook', webhook)
        const { orderId } = webhook.data
        console.log(`Getting order ${orderId} from BigCommerce`)
        const order = await getBigCommerceRetry(`/orders/${orderId}`)
        console.log('Success, publishing to SQS')
        const messageParams = {
            MessageAttributes: {
                "webhook": {
                    DataType: 'String',
                    StringValue: `${event.body}`
                }
            },
            MessageBody: JSON.stringify(order),
            QueueUrl: process.env.SQS_QUEUE_URL
        }

        const messageData = await sqsClient.sendMessage(messageParams).promise()
        console.log(`Success, added order ${orderId} to SQS message ${messageData.MessageId}`)
        console.log('Storing event in DynamoDB')
        const putParams = {
            TableName: process.env.TABLE,
            Item: {
                orderId,
                webhook,
                message: messageData
            },
        }
        await dyanamoDbClient.put(putParams).promise()
        console.log('success')

        response = {
            statusCode: 200,
            body: JSON.stringify(`Successfully added order ${orderId} to the queue`),
        }
    }
    catch (err) {
        // Log error in CloudWatch
        console.error(err, err.stack)
        response = {
            statusCode: 500,
            body: JSON.stringify('Something went wrong.')
        }
        // Publish error to SNS 
        const sns = new AWS.SNS()
        const messageParams = {
            TopicArn: process.env.SNS_TOPIC_ARN,
            Message: `ERROR FROM ${context.functionName}
See the ${context.logStreamName} stream in the ${context.logGroupName} log group for more details about this run.
====================
====================
${err}
${err.stack}`
        }
        await sns.publish(messageParams).promise()
    }
    return response
}
