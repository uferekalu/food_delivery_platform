/**
 * One-time bootstrap for the very first admin account. Promoting anyone to `admin` normally
 * requires an existing admin (PATCH /users/:id/role) — this script exists purely to break that
 * chicken-and-egg problem. Run once per environment, then use the API for every admin after.
 *
 * Usage: register a normal account through the app first, then:
 *   npm run seed:admin -- you@example.com
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { User, UserSchema } from '../src/users/schemas/user.schema';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run seed:admin -- <email>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set — check your .env file.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const UserModel = mongoose.model(User.name, UserSchema);

  // Mongoose 9 deprecated `new: true` in favor of `returnDocument: 'after'`.
  const user = await UserModel.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    { role: 'admin' },
    { returnDocument: 'after' },
  ).exec();

  if (!user) {
    console.error(`No user found with email "${email}" — they must register a normal account first.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`${user.email} is now an admin.`);
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
