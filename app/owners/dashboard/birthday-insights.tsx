
"use client";

type BirthdayCustomer = {
  id: string;
  name: string;
  dateOfBirth: string | null;
};

type BirthdayEntry = {
  id: string;
  name: string;
  birthday: string;
  daysUntil: number;
  sortDate: number;
};

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getNextBirthday(dateOfBirth: string, today: Date) {
  const parts = dateOfBirth.split("-").map(Number);

  if (
    parts.length !== 3 ||
    !parts.every(Number.isInteger)
  ) {
    return null;
  }

  const [, month, day] = parts;

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  let year = today.getFullYear();

  function birthdayDate(targetYear: number) {
    // In non-leap years, 29 February is observed on 28 February.
    const adjustedDay =
      month === 2 && day === 29 && !isLeapYear(targetYear)
        ? 28
        : day;

    const date = new Date(targetYear, month - 1, adjustedDay);

    if (
      date.getFullYear() !== targetYear ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== adjustedDay
    ) {
      return null;
    }

    return date;
  }

  let nextBirthday = birthdayDate(year);

  if (!nextBirthday) return null;

  let nextUtc = Date.UTC(
    nextBirthday.getFullYear(),
    nextBirthday.getMonth(),
    nextBirthday.getDate()
  );

  if (nextUtc < todayUtc) {
    year += 1;
    nextBirthday = birthdayDate(year);

    if (!nextBirthday) return null;

    nextUtc = Date.UTC(
      nextBirthday.getFullYear(),
      nextBirthday.getMonth(),
      nextBirthday.getDate()
    );
  }

  return {
    date: nextBirthday,
    daysUntil: Math.round(
      (nextUtc - todayUtc) / 86400000
    ),
    sortDate: nextUtc,
  };
}

function formatBirthday(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
}

export default function BirthdayInsights({
  customers,
}: {
  customers: BirthdayCustomer[];
}) {
  const today = new Date();

  const birthdayCustomers = customers.filter(
    (customer) =>
      Boolean(customer.dateOfBirth) &&
      /^\d{4}-\d{2}-\d{2}$/.test(customer.dateOfBirth || "")
  );

  const birthdays: BirthdayEntry[] = birthdayCustomers
    .map((customer) => {
      const next = getNextBirthday(
        customer.dateOfBirth!,
        today
      );

      if (!next) return null;

      return {
        id: customer.id,
        name: customer.name || "Planet Health member",
        birthday: formatBirthday(next.date),
        daysUntil: next.daysUntil,
        sortDate: next.sortDate,
      };
    })
    .filter(
      (birthday): birthday is BirthdayEntry =>
        birthday !== null
    )
    .sort((a, b) => a.sortDate - b.sortDate);

  const thisMonth = birthdayCustomers.filter((customer) => {
    const month = Number(customer.dateOfBirth!.split("-")[1]);
    return month === today.getMonth() + 1;
  }).length;

  const nextSevenDays = birthdays.filter(
    (birthday) => birthday.daysUntil <= 7
  ).length;

  const upcomingBirthdays = birthdays.filter(
    (birthday) => birthday.daysUntil <= 30
  );

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <div>
          <p style={styles.eyebrow}>MAKE EVERY MEMBER FEEL SPECIAL</p>
          <h2 style={styles.title}>BIRTHDAY INSIGHTS.</h2>
          <p style={styles.description}>
            Keep track of loyalty members’ upcoming birthdays.
          </p>
        </div>

        <span style={styles.memberCount}>
          {birthdayCustomers.length} REGISTERED
        </span>
      </div>

      <div style={styles.metrics}>
        <div style={styles.metric}>
          <span style={styles.metricLabel}>REGISTERED BIRTHDAYS</span>
          <strong style={styles.metricValue}>
            {birthdayCustomers.length.toLocaleString("en-GB")}
          </strong>
          <span style={styles.metricNote}>Loyalty members with a DOB</span>
        </div>

        <div style={styles.metric}>
          <span style={styles.metricLabel}>THIS MONTH</span>
          <strong style={styles.metricValue}>
            {thisMonth.toLocaleString("en-GB")}
          </strong>
          <span style={styles.metricNote}>Birthdays in this calendar month</span>
        </div>

        <div style={styles.metric}>
          <span style={styles.metricLabel}>NEXT 7 DAYS</span>
          <strong style={styles.metricValue}>
            {nextSevenDays.toLocaleString("en-GB")}
          </strong>
          <span style={styles.metricNote}>Birthdays coming up</span>
        </div>
      </div>

      <div style={styles.upcoming}>
        <div style={styles.upcomingHeader}>
          <h3 style={styles.upcomingTitle}>COMING UP.</h3>
          <span style={styles.upcomingCount}>
            NEXT 30 DAYS
          </span>
        </div>

        {upcomingBirthdays.length === 0 ? (
          <p style={styles.empty}>
            No birthdays coming up in the next 30 days.
          </p>
        ) : (
          <div>
            {upcomingBirthdays.map((birthday) => (
              <div key={birthday.id} style={styles.birthdayRow}>
                <div style={styles.birthdayPerson}>
                  <span style={styles.avatar}>
                    {birthday.name.charAt(0).toUpperCase()}
                  </span>

                  <div>
                    <strong style={styles.name}>
                      {birthday.name}
                    </strong>
                    <span style={styles.date}>
                      {birthday.birthday}
                    </span>
                  </div>
                </div>

                <span style={styles.days}>
                  {birthday.daysUntil === 0
                    ? "TODAY"
                    : birthday.daysUntil === 1
                      ? "TOMORROW"
                      : `${birthday.daysUntil} DAYS`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={styles.footnote}>
        Birthday information is shown for loyalty members who have supplied
        their date of birth. Birth years are not displayed.
      </p>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "14px",
    padding: "25px",
    marginBottom: "45px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "15px",
    flexWrap: "wrap",
    marginBottom: "24px",
  },
  eyebrow: {
    color: "#398900",
    fontSize: "11px",
    fontWeight: 950,
    letterSpacing: "2px",
    margin: "0 0 10px",
  },
  title: {
    fontSize: "clamp(24px, 4vw, 34px)",
    fontWeight: 950,
    letterSpacing: "-1px",
    margin: "0 0 10px",
  },
  description: {
    fontSize: "13px",
    color: "#666",
    lineHeight: 1.6,
    margin: 0,
  },
  memberCount: {
    background: "#B4FF00",
    color: "#111",
    borderRadius: "6px",
    padding: "9px 12px",
    fontSize: "10px",
    fontWeight: 950,
    letterSpacing: "1px",
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "10px",
    marginBottom: "25px",
  },
  metric: {
    display: "flex",
    flexDirection: "column",
    background: "#111",
    color: "#fff",
    borderRadius: "9px",
    padding: "18px",
    minWidth: 0,
  },
  metricLabel: {
    color: "#B4FF00",
    fontSize: "10px",
    fontWeight: 950,
    letterSpacing: "1px",
  },
  metricValue: {
    fontSize: "34px",
    fontWeight: 950,
    margin: "12px 0 5px",
  },
  metricNote: {
    color: "#ccc",
    fontSize: "11px",
    lineHeight: 1.5,
  },
  upcoming: {
    border: "1px solid #ddd",
    borderRadius: "10px",
    overflow: "hidden",
  },
  upcomingHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    padding: "16px",
    background: "#f7f7f7",
    borderBottom: "1px solid #ddd",
  },
  upcomingTitle: {
    fontSize: "13px",
    fontWeight: 950,
    margin: 0,
  },
  upcomingCount: {
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "1px",
    color: "#666",
  },
  birthdayRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px",
    borderBottom: "1px solid #eee",
  },
  birthdayPerson: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
  },
  avatar: {
    width: "36px",
    height: "36px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#B4FF00",
    color: "#111",
    borderRadius: "50%",
    fontSize: "14px",
    fontWeight: 950,
  },
  name: {
    display: "block",
    fontSize: "13px",
    fontWeight: 900,
    overflowWrap: "anywhere",
  },
  date: {
    display: "block",
    color: "#777",
    fontSize: "11px",
    marginTop: "4px",
  },
  days: {
    flexShrink: 0,
    background: "#111",
    color: "#B4FF00",
    borderRadius: "5px",
    padding: "7px 9px",
    fontSize: "9px",
    fontWeight: 950,
    letterSpacing: "0.5px",
  },
  empty: {
    padding: "22px 16px",
    textAlign: "center",
    color: "#777",
    fontSize: "12px",
  },
  footnote: {
    color: "#888",
    fontSize: "10px",
    lineHeight: 1.5,
    margin: "15px 0 0",
  },
};
