// EcoPrompt Guardians — Azure infrastructure (Functions API + telemetry + storage).
// Deploy:
//   az group create -n eco-prompt-guardians -l eastus
//   az deployment group create -g eco-prompt-guardians -f infra/bicep/main.bicep \
//     -p namePrefix=ecoguard deployAzureOpenAI=false
//
// The API runs locally without any of this (plain Node server + in-memory store).
// This template provisions the cloud backing for a real deployment.

@description('Short prefix for resource names (3-11 lowercase chars).')
@minLength(3)
@maxLength(11)
param namePrefix string

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Set true to also provision an Azure OpenAI account for LLM coaching.')
param deployAzureOpenAI bool = false

@description('Azure OpenAI model deployment name (used when deployAzureOpenAI = true).')
param openAiDeploymentName string = 'gpt-4o-mini'

@description('Azure OpenAI model + version to deploy.')
param openAiModel object = {
  name: 'gpt-4o-mini'
  version: '2024-07-18'
}

var suffix = uniqueString(resourceGroup().id)
var storageName = toLower('${namePrefix}st${suffix}')
var planName = '${namePrefix}-plan'
var functionAppName = '${namePrefix}-api-${suffix}'
var insightsName = '${namePrefix}-ai'
var openAiName = '${namePrefix}-openai-${suffix}'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource scoresTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  name: '${storageName}/default/scores'
  dependsOn: [storage]
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: insightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {}
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: ['*']
      }
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(functionAppName)
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: insights.properties.ConnectionString
        }
        {
          name: 'ECO_STORAGE_CONNECTION_STRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}'
        }
        {
          name: 'ECO_STORAGE_TABLE'
          value: 'scores'
        }
      ]
    }
  }
}

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = if (deployAzureOpenAI) {
  name: openAiName
  location: location
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: openAiName
    publicNetworkAccess: 'Enabled'
  }
}

resource openAiDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = if (deployAzureOpenAI) {
  parent: openAi
  name: openAiDeploymentName
  sku: {
    name: 'Standard'
    capacity: 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiModel.name
      version: openAiModel.version
    }
  }
}

output functionAppName string = functionApp.name
output functionAppHostname string = functionApp.properties.defaultHostName
output appInsightsConnectionString string = insights.properties.ConnectionString
output storageAccountName string = storage.name
output openAiEndpoint string = deployAzureOpenAI ? openAi.properties.endpoint : ''
