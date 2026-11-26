
export async function GET(request: NextRequest) {
  try {
    if (!(await isOwner(request))) {
      return NextResponse.json(
        { success: false, message: "Owner access required" },
        { status: 401 }
      );
    }

    const { baseUrl, key } = getDatabaseSettings();

    const response = await fetch(
      `${baseUrl}/rest/v1/staff_accounts?select=staff_id,is_active,pin_hash,created_at,updated_at,last_login_at&order=staff_id.asc`,
      {
        headers: databaseHeaders(key),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error("Unable to retrieve staff accounts");
    }

    const accounts = await response.json();

    const staff = accounts.map((account: {
      staff_id: number;
      is_active: boolean;
      pin_hash: string | null;
      created_at: string;
      updated_at: string;
      last_login_at: string | null;
    }) => ({
      staff_id: account.staff_id,
      is_active: account.is_active,
      has_pin: Boolean(account.pin_hash),
      created_at: account.created_at,
      updated_at: account.updated_at,
      last_login_at: account.last_login_at,
    }));

    return NextResponse.json({
      success: true,
      staff,
    });
  } catch (error) {
    console.error("Owners staff GET error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load staff accounts.",
      },
      { status: 500 }
    );
  }
}
