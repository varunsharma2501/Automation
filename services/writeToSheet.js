const { google } = require("googleapis");
const path = require("path");
const { GoogleAuth } = require("google-auth-library");

const writeToSheet = async (data, sheetName) => {
  const auth = new GoogleAuth({
    keyFile: path.join(__dirname, "..", "config", "service-account.json"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  console.log("Path isss",path.join(__dirname, "..", "config", "service-account.json"))
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const spreadsheetId = process.env.SPREADSHEET_ID;

  // Convert JSON to 2D array
  const headers = ["name", "phone","companyUrl","isCompanyUrlValid", "ownerName", "description","location"];
  const values = data.map((row) => headers.map((key) => row[key] || ""));

  // Clear the existing content
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A1:Z`,
  });

  // Write headers and values
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [headers, ...values],
    },
  });

  console.log("✅ Data written to Google Sheet!");
};

module.exports = writeToSheet;
