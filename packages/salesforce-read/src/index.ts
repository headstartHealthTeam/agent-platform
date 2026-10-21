export {
  SALESFORCE_ORGANIZATION_READ,
  SalesforceReadError,
  salesforceTargetSchema,
  parseSalesforceTarget,
  assertSalesforceOrganization,
  salesforceOrganizationRequirement,
  completeQueryRecords,
  type SalesforceTarget,
  type SalesforceOrganization,
} from './contracts.js';
export {
  connectSalesforceCli,
  type SalesforceReadCommand,
  type SalesforceQueryReader,
  type SalesforceQueryOptions,
} from './cli.js';
