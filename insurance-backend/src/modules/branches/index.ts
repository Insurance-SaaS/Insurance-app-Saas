// Barrel export for branches module
// Allows clean imports from other modules:
// import { Branch, Contacts, CreateBranchDto } from './branches'

// Entities (exported for use in relationships by other modules)
export * from './entities/branch.entity';
export * from './entities/contacts.entity';

// DTOs (exported for shared validation/types)
export * from './dtos/create-branch.dto';
export * from './dtos/update-branch.dto';
export * from './dtos/branch-response.dto';
export * from './dtos/create-contact.dto';
export * from './dtos/update-contact.dto';
export * from './dtos/contact-response.dto';

// Note: Services and Controllers are NOT exported as they are internal to this module
// They are located in ./services/ and ./controllers/ directories
// Use BranchesModule import in app.module.ts instead

