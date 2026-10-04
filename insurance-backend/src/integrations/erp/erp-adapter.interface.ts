import { CreateContractDto } from './dtos/create-contract.dto';

export interface ErpAdapter {
  createMapping(externalAccountId: string, userId: string): Promise<any>;
  getMappings(): Promise<any>;
  getMappingByAccount(externalAccountId: string): Promise<any>;
  getMappingByUser(userId: string): Promise<any>;
  updateMapping(externalAccountId: string, userId: string): Promise<any>;
  deleteMapping(externalAccountId: string): Promise<any>;
  createContract(newContract: CreateContractDto, userId: string): Promise<any>;
  getAllContracts(userId: string, language?: 'en' | 'fr' | 'ar'): Promise<any>;
  getContractById(contractId: string, userId: string, language?: 'en' | 'fr' | 'ar'): Promise<any>;
}
