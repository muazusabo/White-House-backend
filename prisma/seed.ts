import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'owner@campus-restaurant.local';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.ADMIN_NAME || 'Restaurant Owner';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { name, email, password: hashed, role: 'ADMIN' },
    });
    console.log(`Admin user created: ${email}`);
  } else {
    console.log('Admin user already exists, skipping.');
  }

  await prisma.restaurantSettings.upsert({
    where: { id: 1 },
    update: { restaurantName: 'White House Eatry' },
    create: {
      id: 1,
      restaurantName: 'White House Eatry',
      phone: '+000 000 0000',
      location: 'Student Union Building, Ground Floor',
      openingHours: 'Mon - Fri: 8:00 AM - 6:00 PM',
      collectionInstructions: 'Please show your order number at the counter.',
    },
  });

  const categories = [
    { name: 'Cooked Food', slug: 'cooked-food' },
    { name: 'Snacks', slug: 'snacks' },
    { name: 'Drinks', slug: 'drinks' },
    { name: 'Fruits', slug: 'fruits' },
  ];

  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
  }

  const cookedFood = await prisma.category.findUniqueOrThrow({
    where: { slug: 'cooked-food' },
  });
  const existingFood = await prisma.product.findFirst({
    where: { name: 'Nigerian Made Food', categoryId: cookedFood.id },
  });
  if (existingFood) {
    await prisma.product.update({
      where: { id: existingFood.id },
      data: {
        description: 'Well prepared Nigerian made food',
        price: 2500,
        available: true,
      },
    });
  } else {
    await prisma.product.create({
      data: {
        name: 'Nigerian Made Food',
        description: 'Well prepared Nigerian made food',
        price: 2500,
        available: true,
        categoryId: cookedFood.id,
      },
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
