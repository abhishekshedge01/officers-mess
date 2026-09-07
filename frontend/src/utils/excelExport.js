import * as XLSX from "xlsx";

export const exportToExcel = (rows, fileName = "export") => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return false;
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

  XLSX.writeFile(workbook, `${fileName}.xlsx`);

  return true;
};

export const exportRevenueToExcel = (
  revenueRows,
  monthlyRows = [],
  fileName = "revenue",
) => {
  if (
    (!Array.isArray(revenueRows) || revenueRows.length === 0) &&
    (!Array.isArray(monthlyRows) || monthlyRows.length === 0)
  ) {
    return false;
  }

  const workbook = XLSX.utils.book_new();

  if (Array.isArray(revenueRows) && revenueRows.length > 0) {
    const detailsSheet = XLSX.utils.json_to_sheet(revenueRows);

    XLSX.utils.book_append_sheet(workbook, detailsSheet, "Revenue Details");
  }

  if (Array.isArray(monthlyRows) && monthlyRows.length > 0) {
    const summarySheet = XLSX.utils.json_to_sheet(monthlyRows);

    XLSX.utils.book_append_sheet(workbook, summarySheet, "Monthly Summary");
  }

  XLSX.writeFile(workbook, `${fileName}.xlsx`);

  return true;
};
