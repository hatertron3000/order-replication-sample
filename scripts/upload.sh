sh scripts/build.sh
echo "## Uploading new artifacts"
aws s3 cp build/get-new-orders.zip s3://$AWS_DEPLOYMENT_BUCKET
aws s3 cp build/new-orders-webhook.zip s3://$AWS_DEPLOYMENT_BUCKET
aws s3 cp build/process-new-orders.zip s3://$AWS_DEPLOYMENT_BUCKET
aws s3 cp cloudformation/stack.json s3://$AWS_DEPLOYMENT_BUCKET