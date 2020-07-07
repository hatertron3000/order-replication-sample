const AWS = require('aws-sdk')
const BigCommerce = require('node-bigcommerce')
const dynamoDbClient = new AWS.DynamoDB.DocumentClient()
const sqsClient = new AWS.SQS()
const bigCommerce = new BigCommerce({
    logLevel: 'info',
    clientId: process.env.CLIENT_ID,
    accessToken: process.env.TOKEN,
    storeHash: process.env.STORE_HASH,
    responseType: 'json',
    apiVersion: 'v2'
})
const maxJobsToStore = 50
const paginationLimit = 50
const allowedStatusIds = [10, 11, 7]


exports.handler = async (event, context) => {
    const now = Date.now()
    const table = process.env.TABLE
    const store = process.env.STORE_HASH
    let returnValue = {
        statusCode: 500,
        body: JSON.stringify({
            status: 500,
            message: `Something went wrong.`
        }),
    }

    try {
        // Get a count of orders by status
        const job = {
            timestamp: now,
            orderMetadata: [],
            messages: [],
            countData: await bigCommerce.get(`/orders/count?is_deleted=false`),
            store
        }

        // Retrieve orders in an allowed state, then send them to SQS
        await Promise.all(job.countData.statuses.map(async status => {
            if (allowedStatusIds.includes(status.id)) {
                const numPages = Math.ceil(status.count / paginationLimit)
                for (let i = 1; i <= numPages; i++) {
                    const url = `/orders?page=${i}&limit=${paginationLimit}&status_id=${status.id}&is_deleted=false`
                    console.log(`Getting page ${i} of ${numPages} of orders in "${status.custom_label}" state.`, url)
                    const orders = await bigCommerce.get(url)

                    console.log(`Success, adding ${orders.length} orders to the queue`)
                    if (orders.length)
                        await Promise.all(orders.map(async order => {
                            console.log(`Adding order ${order.id} to queue`)
                            const messageParams = {
                                MessageAttributes: {
                                    "pollTimestamp": {
                                        DataType: 'Number',
                                        StringValue: `${now}`
                                    }
                                },
                                MessageBody: JSON.stringify(order),
                                QueueUrl: process.env.SQS_QUEUE_URL
                            }
                            const messageData = await sqsClient.sendMessage(messageParams).promise()
                            console.log(`Success, added ${messageData.MessageId} to queue for order ${order.id}.`)
                            job.messages.push(messageData)
                        }))

                    // Store job data
                    job.orderMetadata.push(orders.map(order => ({
                        date_created: order.date_created,
                        date_modified: order.date_modified,
                        id: order.id,
                        status: order.status,
                    })))
                }
            }
        }))

        // Store the job in the DB
        console.log(`Storing job: { timestamp: ${job.timestamp} }`)
        const putParams = {
            TableName: table,
            Item: job
        }
        await dynamoDbClient.put(putParams).promise()
        console.log('Success, returning')
        returnValue = {
            statusCode: 200,
            body: JSON.stringify({
                status: 200,
                message: `Finished adding ${job.messages.length} to queue`
            }),
        }
    }
    catch (err) {
        // Log error in CloudWatch
        console.err(err, err.stack)
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
    return returnValue
}