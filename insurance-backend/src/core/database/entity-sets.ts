/**
 * The two entity sets of the platform. They never mix: platform entities live
 * only in the platform (control-plane) database, tenant entities only in each
 * tenant's own database.
 */
import { Tenant } from 'src/core/tenant/entities/tenant.entity';
import { TenantPlugin } from 'src/core/plugin-registry/entities/tenant-plugin.entity';
import { PlatformAdmin } from 'src/core/platform-admin/entities/platform-admin.entity';
import { PlatformAdminCredential } from 'src/core/platform-admin/entities/platform-admin-credential.entity';
import { CustomFieldDefinition } from 'src/core/custom-fields/entities/custom-field-definition.entity';
import { AuditLog } from 'src/shared/entities/audit-log.entity';

import { User } from 'src/modules/users/entities/user.entity';
import { Claim } from 'src/modules/claims/entities/claim.entity';
import { Document } from 'src/modules/claims/entities/document.entity';
import { Expert } from 'src/modules/claims/entities/expert.entity';
import { Quote } from 'src/modules/quotes/entities/quote.entity';
import { Product } from 'src/modules/quotes/entities/product.entity';
import { CoverageDetail } from 'src/modules/quotes/entities/coverage-detail.entity';
import { Payment } from 'src/modules/quotes/entities/payment.entity';
import { SummaryTerms } from 'src/modules/quotes/entities/summary-terms.entity';
import { Branch } from 'src/modules/branches/entities/branch.entity';
import { Contacts } from 'src/modules/branches/entities/contacts.entity';
import { DeviceToken } from 'src/modules/notifications/entities/device-token.entity';
import { Notification } from 'src/modules/notifications/entities/notification.entity';
import { Log } from 'src/modules/logging/entities/log.entity';
import { Mapping } from 'src/integrations/erp/entities/mapping.entity';
import { Contract } from 'src/integrations/erp/entities/contract.entity';
import { PaymentTransaction } from 'src/modules/payment/entities/payment-transaction.entity';

export const PLATFORM_ENTITIES = [
  Tenant,
  TenantPlugin,
  PlatformAdmin,
  PlatformAdminCredential,
  CustomFieldDefinition,
  AuditLog,
];

export const TENANT_ENTITIES = [
  User,
  Claim,
  Document,
  Expert,
  Quote,
  Product,
  CoverageDetail,
  Payment,
  SummaryTerms,
  Branch,
  Contacts,
  DeviceToken,
  Notification,
  Log,
  Mapping,
  Contract,
  PaymentTransaction,
];

export const PLATFORM_MIGRATIONS_TABLE = 'platform_migrations';
export const TENANT_MIGRATIONS_TABLE = 'tenant_migrations';
