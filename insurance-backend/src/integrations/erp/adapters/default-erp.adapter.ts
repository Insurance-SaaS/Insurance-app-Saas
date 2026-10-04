import { Injectable } from '@nestjs/common';
import { CreateContractDto } from '../dtos/create-contract.dto';
import { ErpService } from '../erp.service';
import { ErpAdapter } from '../erp-adapter.interface';

@Injectable()
export class DefaultErpAdapter implements ErpAdapter {
  constructor(private readonly erpService: ErpService) {}

  createMapping(externalAccountId: string, userId: string): Promise<any> {
    return this.erpService.createMapping(externalAccountId, userId);
  }

  getMappings(): Promise<any> {
    return this.erpService.getMappings();
  }

  getMappingByAccount(externalAccountId: string): Promise<any> {
    return this.erpService.getMappingByAccount(externalAccountId);
  }

  getMappingByUser(userId: string): Promise<any> {
    return this.erpService.getMappingByUser(userId);
  }

  updateMapping(externalAccountId: string, userId: string): Promise<any> {
    return this.erpService.updateMapping(externalAccountId, userId);
  }

  deleteMapping(externalAccountId: string): Promise<any> {
    return this.erpService.deleteMapping(externalAccountId);
  }

  createContract(newContract: CreateContractDto, userId: string): Promise<any> {
    return this.erpService.createContract(newContract, userId);
  }

  getAllContracts(userId: string, language: 'en' | 'fr' | 'ar' = 'fr'): Promise<any> {
    return this.erpService.getAllContracts(userId, language);
  }

  getContractById(contractId: string, userId: string, language: 'en' | 'fr' | 'ar' = 'fr'): Promise<any> {
    return this.erpService.getContractById(contractId, userId, language);
  }
}
