import type { TableRow } from "./types";

export const STARTER_SQL = `SELECT
  id,
  TRIM(first_name) AS first_name,
  TRIM(last_name) AS last_name,
  LOWER(TRIM(email)) AS email,
  CASE
    WHEN LOWER(TRIM(country)) IN ('uk', 'united kingdom') THEN 'United Kingdom'
    WHEN LOWER(TRIM(country)) IN ('usa', 'united states') THEN 'USA'
    ELSE TRIM(country)
  END AS country,
  signup_date,
  amount,
  LOWER(TRIM(status)) AS status
FROM current_table;`;

export const rawDataset: TableRow[] = [
  { id: 1, first_name: "  John", last_name: "DOE", email: "john.doe@email.com", country: "USA", signup_date: "2024-01-15", amount: "1250.50", status: "active" },
  { id: 2, first_name: "jane", last_name: "Smith  ", email: "JANE.SMITH@EMAIL.COM", country: "united states", signup_date: "2024-01-16", amount: "$2,500.00", status: "Active" },
  { id: 3, first_name: "BOB", last_name: "JOHNSON", email: "bob@email", country: "usa", signup_date: "01/17/2024", amount: "750", status: "ACTIVE" },
  { id: 4, first_name: "Alice", last_name: "Williams", email: "alice.williams@email.com", country: "Canada", signup_date: "2024-01-18", amount: "3,200.75", status: "inactive" },
  { id: 5, first_name: "  John", last_name: "DOE", email: "john.doe@email.com", country: "USA", signup_date: "2024-01-15", amount: "1250.50", status: "active" },
  { id: 6, first_name: null, last_name: "Brown", email: "brown@email.com", country: "UK", signup_date: "2024-01-19", amount: "1,800", status: "active" },
  { id: 7, first_name: "Charlie", last_name: null, email: "charlie@email.com", country: "United Kingdom", signup_date: "2024-01-20", amount: null, status: "Active" },
  { id: 8, first_name: "DAVID", last_name: "miller", email: "david.miller@email.com", country: "canada", signup_date: "2024-01-21", amount: "$4,500.00", status: "INACTIVE" },
  { id: 9, first_name: "Emma", last_name: "DAVIS", email: "emma.davis@", country: "Australia", signup_date: "01/22/2024", amount: "2,100.00", status: "active" },
  { id: 10, first_name: "frank", last_name: "wilson", email: "FRANK.WILSON@EMAIL.COM", country: "australia", signup_date: "2024-01-23", amount: "$950.50", status: "Active" },
  { id: 11, first_name: "Grace", last_name: "Moore", email: "grace.moore@email.com", country: "New Zealand", signup_date: "2024-01-24", amount: "1,650", status: "active" },
  { id: 12, first_name: "Henry", last_name: "Taylor  ", email: "henry.taylor@email.com", country: "new zealand", signup_date: "01/25/2024", amount: "3,300.25", status: "ACTIVE" },
  { id: 13, first_name: "  ISABEL", last_name: "Anderson", email: "isabel@email", country: "USA", signup_date: "2024-01-26", amount: "$2,750", status: "inactive" },
  { id: 14, first_name: "jack", last_name: "THOMAS", email: "jack.thomas@email.com", country: "Canada", signup_date: "2024-01-27", amount: "1,200.00", status: "Active" },
  { id: 15, first_name: "Kate", last_name: "Jackson", email: "kate.jackson@email.com", country: "UK", signup_date: "01/28/2024", amount: "1,950", status: "active" },
  { id: 16, first_name: "Liam", last_name: "White", email: "liam.white@email.com", country: null, signup_date: "2024-01-29", amount: "2,800.50", status: "ACTIVE" },
  { id: 17, first_name: "Mia", last_name: "Harris", email: "mia.harris@email.com", country: "USA", signup_date: "2024-01-30", amount: null, status: "inactive" },
  { id: 18, first_name: "noah", last_name: "martin", email: "NOAH.MARTIN@EMAIL.COM", country: "canada", signup_date: "2024-01-31", amount: "$3,500.00", status: "Active" },
  { id: 19, first_name: "Olivia", last_name: "Thompson", email: "olivia.thompson@", country: "Australia", signup_date: "2024-02-01", amount: "1,450", status: "active" },
  { id: 20, first_name: "  PAUL", last_name: "garcia", email: "paul.garcia@email.com", country: "uk", signup_date: "02/02/2024", amount: "2,600.75", status: "ACTIVE" },
];
