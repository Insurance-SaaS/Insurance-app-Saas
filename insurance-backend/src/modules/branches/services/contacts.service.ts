import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Contacts } from '../entities/contacts.entity';
import { CreateContactDto } from '../dtos/create-contact.dto';
import { UpdateContactDto } from '../dtos/update-contact.dto';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';

@Injectable()
export class ContactsService {
  constructor(
    private readonly tenantRepositoryFactory: TenantRepositoryFactory,
  ) {}

  private get contactsRepository() {
    return this.tenantRepositoryFactory.getRepository(Contacts);
  }

  async findAll(): Promise<{ data: Contacts[]; total: number }> {
    const [data, total] = await this.contactsRepository.findAndCount({
      order: { type: 'ASC', value: 'ASC' },
    });
    return { data, total };
  }

  async findById(id: string): Promise<Contacts> {
    const contact = await this.contactsRepository.findOne({ where: { id } });
    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }
    return contact;
  }

  async findByType(type: string): Promise<Contacts[]> {
    return this.contactsRepository.find({
      where: { type: type as any },
      order: { value: 'ASC' },
    });
  }

  async create(createContactDto: CreateContactDto): Promise<Contacts> {
    // Check if contact with same type and value already exists
    const existingContact = await this.contactsRepository.findOne({
      where: {
        type: createContactDto.type,
        value: createContactDto.value,
      },
    });

    if (existingContact) {
      throw new ConflictException(
        `Contact with type ${createContactDto.type} and value ${createContactDto.value} already exists`,
      );
    }

    const contact = this.contactsRepository.create(createContactDto);
    return this.contactsRepository.save(contact);
  }

  async update(id: string, updateContactDto: UpdateContactDto): Promise<Contacts> {
    const contact = await this.findById(id);

    // Check for duplicate if type or value is being updated
    if (updateContactDto.type || updateContactDto.value) {
      const checkType = updateContactDto.type ?? contact.type;
      const checkValue = updateContactDto.value ?? contact.value;

      const existingContact = await this.contactsRepository.findOne({
        where: {
          type: checkType,
          value: checkValue,
        },
      });

      if (existingContact && existingContact.id !== id) {
        throw new ConflictException(
          `Contact with type ${checkType} and value ${checkValue} already exists`,
        );
      }
    }

    Object.assign(contact, updateContactDto);
    return this.contactsRepository.save(contact);
  }

  async delete(id: string): Promise<void> {
    const contact = await this.findById(id);
    await this.contactsRepository.remove(contact);
  }

  async bulkCreate(contacts: CreateContactDto[]): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    // Process in batches of 50 for better performance
    const batchSize = 50;
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

      for (const contactDto of batch) {
        const existingContact = await this.contactsRepository.findOne({
          where: {
            type: contactDto.type,
            value: contactDto.value,
          },
        });

        if (existingContact) {
          skipped++;
          continue;
        }

        const contact = this.contactsRepository.create(contactDto);
        await this.contactsRepository.save(contact);
        created++;
      }

      // Progress logging
      if ((i + batchSize) % 100 === 0 || i + batchSize >= contacts.length) {
        console.log(`   Progress: ${Math.min(i + batchSize, contacts.length)}/${contacts.length} processed...`);
      }
    }

    return { created, skipped };
  }
}

