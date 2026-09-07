import { NextResponse } from "next/server";
import { requireAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type WorkItemType = "insurance" | "private";

type CategoryRow = {
  id: number;
  name: string;
  sort_order: number;
};

type SubCategoryRow = {
  id: number;
  category_id: number;
  name: string;
  sort_order: number;
};

type ItemMasterRow = {
  id: number;
  sub_category_id: number;
  name: string;
  sort_order: number;
};

export async function GET(request: Request) {
  const authResponse = await requireAuthResponse();
  if (authResponse) return authResponse;

  const searchParams = new URL(request.url).searchParams;

  const customerIdParam = searchParams.get("customer_id");
  const typeParam = searchParams.get("type");
  const categoryIdParam = searchParams.get("category_id");
  const subCategoryIdParam = searchParams.get("sub_category_id");

  const customerId = Number(customerIdParam);
  const categoryId = Number(categoryIdParam);
  const subCategoryId = Number(subCategoryIdParam);

  /*
   * ============================================================
   * customer_id
   * ============================================================
   */

  if (
    customerIdParam === null ||
    customerIdParam.trim() === "" ||
    !Number.isInteger(customerId) ||
    customerId <= 0
  ) {
    return NextResponse.json(
      { error: "customer_id is required" },
      { status: 400 }
    );
  }

  /*
   * ============================================================
   * type
   * ============================================================
   */

  if (typeParam !== "insurance" && typeParam !== "private") {
    return NextResponse.json(
      { error: "type must be insurance or private" },
      { status: 400 }
    );
  }

  const type = typeParam as WorkItemType;

  try {
    /*
     * ============================================================
     * 医院の存在確認
     * ============================================================
     */

    const customer = await prisma.customers.findUnique({
      where: {
        id: customerId,
      },
      select: {
        id: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Invalid customer_id" },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 保険
     * ============================================================
     *
     * DB構造
     *
     * insurance_categories
     *        ↓
     * insurance_sub_categories.category_id
     *        ↓
     * insurance_item_masters.sub_category_id
     *
     */

    if (type === "insurance") {
      /*
       * ----------------------------------------------------------
       * ① 大分類
       * ----------------------------------------------------------
       *
       * category_id が指定されていない場合、
       * insurance_categories から大分類を取得する。
       */

      if (
        categoryIdParam === null ||
        categoryIdParam.trim() === ""
      ) {
        const categories =
          await prisma.$queryRaw<CategoryRow[]>`
            SELECT
              id,
              name,
              sort_order
            FROM insurance_categories
            WHERE is_active = true
            ORDER BY sort_order ASC, id ASC
          `;

        return NextResponse.json(
          categories.map((category) => ({
            id: category.id,
            name: category.name,
            type,
            level: "category",
          }))
        );
      }

      /*
       * category_id の確認
       */

      if (
        !Number.isInteger(categoryId) ||
        categoryId <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid category_id" },
          { status: 400 }
        );
      }

      /*
       * ----------------------------------------------------------
       * ② 中分類
       * ----------------------------------------------------------
       *
       * 選択された大分類の id
       *
       *        ↓
       *
       * insurance_sub_categories.category_id
       *
       */

      if (
        subCategoryIdParam === null ||
        subCategoryIdParam.trim() === ""
      ) {
        const subCategories =
          await prisma.$queryRaw<SubCategoryRow[]>`
            SELECT
              isc.id,
              isc.category_id,
              isc.name,
              isc.sort_order
            FROM insurance_sub_categories isc
            INNER JOIN insurance_categories ic
              ON ic.id = isc.category_id
            WHERE
              isc.category_id = ${categoryId}
              AND isc.is_active = true
              AND ic.is_active = true
            ORDER BY isc.sort_order ASC, isc.id ASC
          `;

        return NextResponse.json(
          subCategories.map((subCategory) => ({
            id: subCategory.id,
            category_id: subCategory.category_id,
            name: subCategory.name,
            type,
            level: "sub_category",
          }))
        );
      }

      /*
       * sub_category_id の確認
       */

      if (
        !Number.isInteger(subCategoryId) ||
        subCategoryId <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid sub_category_id" },
          { status: 400 }
        );
      }

      /*
       * ----------------------------------------------------------
       * ③ 小分類
       * ----------------------------------------------------------
       *
       * 選択された中分類の id
       *
       *        ↓
       *
       * insurance_item_masters.sub_category_id
       *
       */

      const itemMasters =
        await prisma.$queryRaw<ItemMasterRow[]>`
            SELECT
              iim.id,
              iim.sub_category_id,
              iim.name,
              iim.sort_order
          FROM insurance_item_masters iim
          INNER JOIN insurance_sub_categories isc
            ON isc.id = iim.sub_category_id
          INNER JOIN insurance_categories ic
            ON ic.id = isc.category_id
          WHERE
            iim.sub_category_id = ${subCategoryId}
            AND iim.is_active = true
            AND isc.is_active = true
            AND ic.is_active = true
          ORDER BY iim.sort_order ASC, iim.id ASC
        `;

      return NextResponse.json(
        itemMasters.map((item) => ({
          id: item.id,
          sub_category_id: item.sub_category_id,
          name: item.name,

          /*
           * 既存のコードとの互換性用。
           *
           * 今回の正式な小分類名称は name。
           */
          item_name: item.name,

          type,
          level: "item",
        }))
      );
    }

    /*
     * ============================================================
     * 自費
     * ============================================================
     *
     * DB構造
     *
     * private_categories
     *        ↓
     * private_sub_categories.category_id
     *        ↓
     * private_item_masters.sub_category_id
     */

    if (type === "private") {
      if (
        categoryIdParam === null ||
        categoryIdParam.trim() === ""
      ) {
        const categories =
          await prisma.$queryRaw<CategoryRow[]>`
            SELECT
              id,
              name,
              sort_order
            FROM private_categories
            WHERE is_active = true
            ORDER BY sort_order ASC, id ASC
          `;

        return NextResponse.json(
          categories.map((category) => ({
            id: category.id,
            name: category.name,
            type,
            level: "category",
          }))
        );
      }

      if (
        !Number.isInteger(categoryId) ||
        categoryId <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid category_id" },
          { status: 400 }
        );
      }

      if (
        subCategoryIdParam === null ||
        subCategoryIdParam.trim() === ""
      ) {
        const subCategories =
          await prisma.$queryRaw<SubCategoryRow[]>`
            SELECT
              psc.id,
              psc.category_id,
              psc.name,
              psc.sort_order
            FROM private_sub_categories psc
            INNER JOIN private_categories pc
              ON pc.id = psc.category_id
            WHERE
              psc.category_id = ${categoryId}
              AND psc.is_active = true
              AND pc.is_active = true
            ORDER BY psc.sort_order ASC, psc.id ASC
          `;

        return NextResponse.json(
          subCategories.map((subCategory) => ({
            id: subCategory.id,
            category_id: subCategory.category_id,
            name: subCategory.name,
            type,
            level: "sub_category",
          }))
        );
      }

      if (
        !Number.isInteger(subCategoryId) ||
        subCategoryId <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid sub_category_id" },
          { status: 400 }
        );
      }

      const itemMasters =
        await prisma.$queryRaw<ItemMasterRow[]>`
            SELECT
              pim.id,
              pim.sub_category_id,
              pim.name,
              pim.sort_order
          FROM private_item_masters pim
          INNER JOIN private_sub_categories psc
            ON psc.id = pim.sub_category_id
          INNER JOIN private_categories pc
            ON pc.id = psc.category_id
          WHERE
            pim.sub_category_id = ${subCategoryId}
            AND pim.is_active = true
            AND psc.is_active = true
            AND pc.is_active = true
          ORDER BY pim.sort_order ASC, pim.id ASC
        `;

      return NextResponse.json(
        itemMasters.map((item) => ({
          id: item.id,
          sub_category_id: item.sub_category_id,
          name: item.name,
          item_name: item.name,
          type,
          level: "item",
        }))
      );
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error("Failed to fetch work item data", error);

    return NextResponse.json(
      { error: "Database Error" },
      { status: 500 }
    );
  }
}
