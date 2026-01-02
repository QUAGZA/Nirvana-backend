const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const config = require('../config/env');

function getCredential() {
  const { accountName, accountKey } = config.azure;
  if (!accountName || !accountKey) {
    throw new Error('Azure storage credentials are not configured');
  }
  return new StorageSharedKeyCredential(accountName, accountKey);
}

function getBlobServiceClient() {
  const credential = getCredential();
  const { accountName } = config.azure;
  const url = `https://${accountName}.blob.core.windows.net`;
  return new BlobServiceClient(url, credential);
}

function getContainerClient() {
  const client = getBlobServiceClient();
  return client.getContainerClient(config.azure.containerName);
}

function getBlobClient(blobPath) {
  const containerClient = getContainerClient();
  return containerClient.getBlobClient(blobPath);
}

module.exports = {
  getCredential,
  getBlobServiceClient,
  getContainerClient,
  getBlobClient,
};
