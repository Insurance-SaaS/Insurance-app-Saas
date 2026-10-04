import type { User } from 'src/modules/users/entities/user.entity';
import { UploadedFile } from 'src/shared/types/uploaded-file';

/**
 * What other modules may ask of the users module. Returned users never carry
 * the password hash. Types are imported as types only.
 */
export interface IUsersService {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  createUser(
    user: Partial<User>,
    file?: UploadedFile,
    options?: { passwordIsHashed?: boolean },
  ): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<{ message: string; updatedUser: User }>;
  deleteUser(id: string): Promise<{ message: string }>;
}
