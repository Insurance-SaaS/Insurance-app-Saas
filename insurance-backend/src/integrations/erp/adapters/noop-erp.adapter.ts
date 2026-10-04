import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateContractDto } from '../dtos/create-contract.dto';
import { ErpAdapter } from '../erp-adapter.interface';

@Injectable()
export class NoopErpAdapter implements ErpAdapter {
  private throwDisabled(): never {
    throw new BadRequestException('ERP integration is not enabled for this tenant');
  }

  createMapping(_externalAccountId: string, _userId: string): Promise<any> {
    this.throwDisabled();
  }

  getMappings(): Promise<any> {
    this.throwDisabled();
  }

  getMappingByAccount(_externalAccountId: string): Promise<any> {
    this.throwDisabled();
  }

  getMappingByUser(_userId: string): Promise<any> {
    this.throwDisabled();
  }

  updateMapping(_externalAccountId: string, _userId: string): Promise<any> {
    this.throwDisabled();
  }

  deleteMapping(_externalAccountId: string): Promise<any> {
    this.throwDisabled();
  }

  createContract(_newContract: CreateContractDto, _userId: string): Promise<any> {
    this.throwDisabled();
  }

  getAllContracts(_userId: string, _language?: 'en' | 'fr' | 'ar'): Promise<any> {
    this.throwDisabled();
  }

  getContractById(_contractId: string, _userId: string, _language?: 'en' | 'fr' | 'ar'): Promise<any> {
    this.throwDisabled();
  }
}
