sh scripts/build.sh
echo "## Uploading new artifacts"
aws s3 cp build/get-new-orders.zip s3://$1
aws s3 cp build/new-orders-webhook.zip s3://$1
aws s3 cp build/process-new-orders.zip s3://$1
aws s3 cp cloudformation/stack.json s3://$1