echo "## Installing dependencies"
cd lambda/get-new-orders
npm i
cd ../new-orders-webhook
npm i
cd ../process-new-orders
npm i
cd ../..
echo "## Removing previous build artifacts"
rm -r build
mkdir build
echo "## Building new artifacts"
cd lambda/get-new-orders
zip -r ../../build/get-new-orders.zip ./*
cd ../new-orders-webhook
zip -r ../../build/new-orders-webhook.zip ./*
cd ../process-new-orders
zip -r ../../build/process-new-orders.zip ./*
cd ../..
echo "## Finished"