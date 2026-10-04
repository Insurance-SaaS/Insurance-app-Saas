import '../utc';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { createInterface } from 'node:readline';
import { DataSource } from 'typeorm';
import { platformDataSourceOptions } from 'src/config/database.config';
import { PlatformAdminCredential } from 'src/core/platform-admin/entities/platform-admin-credential.entity';
import { PlatformAdmin } from 'src/core/platform-admin/entities/platform-admin.entity';
import { PlatformAdminService } from 'src/core/platform-admin/platform-admin.service';

const USAGE = `Usage: platform-admin <command>

  create <email> [full name]   Create a platform administrator
  set-password <email>         Replace an administrator's password
  deactivate <email>           Stop an administrator from signing in
  activate <email>             Let a deactivated administrator sign in again
  list                         Show the administrators

Run "migrate platform" first: the administrators live in the platform database.

The password is read from the PLATFORM_ADMIN_PASSWORD environment variable or
asked for on the terminal. It is never taken from the command line, where it
would stay in the shell history. Minimum ${PlatformAdminService.MIN_PASSWORD_LENGTH} characters.`;

const env = (key: string) => process.env[key];

/** Asks on the terminal without showing what is typed. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    (terminal as unknown as { _writeToOutput: () => void })._writeToOutput = () => undefined;
    terminal.question('', (answer) => {
      terminal.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function readPassword(): Promise<string> {
  if (process.env.PLATFORM_ADMIN_PASSWORD) {
    return process.env.PLATFORM_ADMIN_PASSWORD;
  }
  if (!process.stdin.isTTY) {
    throw new Error('Set PLATFORM_ADMIN_PASSWORD, or run this command in a terminal to be asked for it');
  }
  const password = await askHidden('Password: ');
  if (password !== (await askHidden('Repeat password: '))) {
    throw new Error('The two passwords are not the same');
  }
  return password;
}

async function main(): Promise<number> {
  const [command, email, ...rest] = process.argv.slice(2);
  const needsEmail = ['create', 'set-password', 'deactivate', 'activate'].includes(command);
  if ((!needsEmail && command !== 'list') || (needsEmail && !email)) {
    console.log(USAGE);
    return command ? 1 : 0;
  }

  const platform = await new DataSource(platformDataSourceOptions(env)).initialize();
  try {
    const admins = new PlatformAdminService(
      platform.getRepository(PlatformAdmin),
      platform.getRepository(PlatformAdminCredential),
    );

    switch (command) {
      case 'create': {
        const admin = await admins.create(email, await readPassword(), rest.join(' ') || undefined);
        console.log(`Created platform administrator ${admin.email}`);
        break;
      }
      case 'set-password':
        await admins.setPassword(email, await readPassword());
        console.log(`Password of ${email} replaced`);
        break;
      case 'deactivate':
      case 'activate':
        await admins.setActive(email, command === 'activate');
        console.log(`${email} is now ${command === 'activate' ? 'active' : 'deactivated'}`);
        break;
      case 'list':
        for (const admin of await admins.list()) {
          console.log(`${admin.isActive ? 'active     ' : 'deactivated'}  ${admin.email}  ${admin.fullName ?? ''}`);
        }
        break;
    }
    return 0;
  } finally {
    await platform.destroy();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
