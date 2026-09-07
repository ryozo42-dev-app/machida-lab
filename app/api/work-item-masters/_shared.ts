import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type WorkItemMasterType = "insurance" | "private";

export class WorkItemMasterRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseType(value: unknown): WorkItemMasterType {
  if (value !== "insurance" && value !== "private") {
    throw new WorkItemMasterRequestError("type must be insurance or private");
  }

  return value;
}

export function parseId(value: string, fieldName = "id") {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new WorkItemMasterRequestError(`${fieldName} must be a positive integer`);
  }

  return id;
}

export function parseParentId(value: unknown, fieldName: string) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new WorkItemMasterRequestError(`${fieldName} must be a positive integer`);
  }

  return id;
}

export function parseName(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    throw new WorkItemMasterRequestError("name is required");
  }

  const name = value.trim();

  if (name.length === 0) {
    throw new WorkItemMasterRequestError("name is required");
  }

  if (name.length > maxLength) {
    throw new WorkItemMasterRequestError(`name must be ${maxLength} characters or less`);
  }

  return name;
}

export function parseCreateBody(body: unknown, maxNameLength: number) {
  if (!isObject(body)) {
    throw new WorkItemMasterRequestError("Request body must be an object");
  }

  return {
    type: parseType(body.type),
    name: parseName(body.name, maxNameLength),
    body,
  };
}

export function parsePatchBody(body: unknown, maxNameLength: number) {
  if (!isObject(body)) {
    throw new WorkItemMasterRequestError("Request body must be an object");
  }

  const type = parseType(body.type);
  const hasName = Object.prototype.hasOwnProperty.call(body, "name");
  const hasIsActive = Object.prototype.hasOwnProperty.call(body, "is_active");

  if (!hasName && !hasIsActive) {
    throw new WorkItemMasterRequestError("name or is_active is required");
  }

  if (hasIsActive && typeof body.is_active !== "boolean") {
    throw new WorkItemMasterRequestError("is_active must be boolean");
  }

  return {
    type,
    name: hasName ? parseName(body.name, maxNameLength) : undefined,
    is_active: hasIsActive ? (body.is_active as boolean) : undefined,
  };
}

function isUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function handleWorkItemMasterError(error: unknown, logMessage: string) {
  if (error instanceof WorkItemMasterRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (isUniqueError(error)) {
    return NextResponse.json(
      { error: "同じ名称の項目がすでに存在します" },
      { status: 409 }
    );
  }

  console.error(logMessage, error);

  return NextResponse.json({ error: "Database Error" }, { status: 500 });
}

export async function createCategory(type: WorkItemMasterType, name: string) {
  return prisma.$transaction(async (transaction) => {
    if (type === "insurance") {
      const aggregate = await transaction.insurance_categories.aggregate({
        _max: { sort_order: true },
      });

      return transaction.insurance_categories.create({
        data: {
          name,
          sort_order: (aggregate._max.sort_order ?? 0) + 1,
          is_active: true,
        },
        select: { id: true, name: true, sort_order: true, is_active: true },
      });
    }

    const aggregate = await transaction.private_categories.aggregate({
      _max: { sort_order: true },
    });

    return transaction.private_categories.create({
      data: {
        name,
        sort_order: (aggregate._max.sort_order ?? 0) + 1,
        is_active: true,
      },
      select: { id: true, name: true, sort_order: true, is_active: true },
    });
  });
}

export async function updateCategory(
  type: WorkItemMasterType,
  id: number,
  data: { name?: string; is_active?: boolean }
) {
  if (type === "insurance") {
    const existing = await prisma.insurance_categories.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new WorkItemMasterRequestError("Category not found", 404);
    }

    return prisma.insurance_categories.update({
      where: { id },
      data,
      select: { id: true, name: true, sort_order: true, is_active: true },
    });
  }

  const existing = await prisma.private_categories.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new WorkItemMasterRequestError("Category not found", 404);
  }

  return prisma.private_categories.update({
    where: { id },
    data,
    select: { id: true, name: true, sort_order: true, is_active: true },
  });
}

export async function createSubCategory(
  type: WorkItemMasterType,
  categoryId: number,
  name: string
) {
  return prisma.$transaction(async (transaction) => {
    if (type === "insurance") {
      const parent = await transaction.insurance_categories.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });

      if (!parent) {
        throw new WorkItemMasterRequestError("Category not found", 404);
      }

      const aggregate = await transaction.insurance_sub_categories.aggregate({
        where: { category_id: categoryId },
        _max: { sort_order: true },
      });

      return transaction.insurance_sub_categories.create({
        data: {
          category_id: categoryId,
          name,
          sort_order: (aggregate._max.sort_order ?? 0) + 1,
          is_active: true,
        },
        select: {
          id: true,
          category_id: true,
          name: true,
          sort_order: true,
          is_active: true,
        },
      });
    }

    const parent = await transaction.private_categories.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!parent) {
      throw new WorkItemMasterRequestError("Category not found", 404);
    }

    const aggregate = await transaction.private_sub_categories.aggregate({
      where: { category_id: categoryId },
      _max: { sort_order: true },
    });

    return transaction.private_sub_categories.create({
      data: {
        category_id: categoryId,
        name,
        sort_order: (aggregate._max.sort_order ?? 0) + 1,
        is_active: true,
      },
      select: {
        id: true,
        category_id: true,
        name: true,
        sort_order: true,
        is_active: true,
      },
    });
  });
}

export async function updateSubCategory(
  type: WorkItemMasterType,
  id: number,
  data: { name?: string; is_active?: boolean }
) {
  if (type === "insurance") {
    const existing = await prisma.insurance_sub_categories.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new WorkItemMasterRequestError("Sub category not found", 404);
    }

    return prisma.insurance_sub_categories.update({
      where: { id },
      data,
      select: {
        id: true,
        category_id: true,
        name: true,
        sort_order: true,
        is_active: true,
      },
    });
  }

  const existing = await prisma.private_sub_categories.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new WorkItemMasterRequestError("Sub category not found", 404);
  }

  return prisma.private_sub_categories.update({
    where: { id },
    data,
    select: {
      id: true,
      category_id: true,
      name: true,
      sort_order: true,
      is_active: true,
    },
  });
}

export async function createItemMaster(
  type: WorkItemMasterType,
  subCategoryId: number,
  name: string
) {
  return prisma.$transaction(async (transaction) => {
    if (type === "insurance") {
      const parent = await transaction.insurance_sub_categories.findUnique({
        where: { id: subCategoryId },
        select: { id: true },
      });

      if (!parent) {
        throw new WorkItemMasterRequestError("Sub category not found", 404);
      }

      const aggregate = await transaction.insurance_item_masters.aggregate({
        where: { sub_category_id: subCategoryId },
        _max: { sort_order: true },
      });

      return transaction.insurance_item_masters.create({
        data: {
          sub_category_id: subCategoryId,
          name,
          sort_order: (aggregate._max.sort_order ?? 0) + 1,
          is_active: true,
        },
        select: {
          id: true,
          sub_category_id: true,
          name: true,
          sort_order: true,
          is_active: true,
        },
      });
    }

    const parent = await transaction.private_sub_categories.findUnique({
      where: { id: subCategoryId },
      select: { id: true },
    });

    if (!parent) {
      throw new WorkItemMasterRequestError("Sub category not found", 404);
    }

    const aggregate = await transaction.private_item_masters.aggregate({
      where: { sub_category_id: subCategoryId },
      _max: { sort_order: true },
    });

    return transaction.private_item_masters.create({
      data: {
        sub_category_id: subCategoryId,
        name,
        sort_order: (aggregate._max.sort_order ?? 0) + 1,
        is_active: true,
      },
      select: {
        id: true,
        sub_category_id: true,
        name: true,
        sort_order: true,
        is_active: true,
      },
    });
  });
}

export async function updateItemMaster(
  type: WorkItemMasterType,
  id: number,
  data: { name?: string; is_active?: boolean }
) {
  if (type === "insurance") {
    const existing = await prisma.insurance_item_masters.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new WorkItemMasterRequestError("Item master not found", 404);
    }

    return prisma.insurance_item_masters.update({
      where: { id },
      data,
      select: {
        id: true,
        sub_category_id: true,
        name: true,
        sort_order: true,
        is_active: true,
      },
    });
  }

  const existing = await prisma.private_item_masters.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new WorkItemMasterRequestError("Item master not found", 404);
  }

  return prisma.private_item_masters.update({
    where: { id },
    data,
    select: {
      id: true,
      sub_category_id: true,
      name: true,
      sort_order: true,
      is_active: true,
    },
  });
}
