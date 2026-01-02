const { generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const { getBlobClient, getCredential } = require('./blobService');
const config = require('../config/env');

function ensureSasConfig() {
  const { accountName, accountKey } = config.azure;
  if (!accountName || !accountKey) {
    throw new Error('Azure SAS generation requires AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY');
  }
}

function getExpiryDate() {
  const minutes = Number.isFinite(config.azure.sasTtlMinutes) ? config.azure.sasTtlMinutes : 10;
  const ms = minutes * 60 * 1000;
  return new Date(Date.now() + ms);
}

async function getStreamingSasUrl(blobPath) {
  ensureSasConfig();
  const blobClient = getBlobClient(blobPath);
  const credential = getCredential();
  const { accountName } = config.azure;
  const expiresOn = getExpiryDate();

  const sas = generateBlobSASQueryParameters(
    {
      containerName: blobClient.containerName,
      blobName: blobClient.name,
      permissions: BlobSASPermissions.parse('r'),
      startsOn: new Date(Date.now() - 5 * 60 * 1000),
      expiresOn,
      protocol: 'https',
    },
    credential,
  );

  return `${blobClient.url}?${sas.toString()}`;
}

module.exports = {
  getStreamingSasUrl,
};
