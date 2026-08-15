export function parseCsv(text) {
  const rows = parseRows(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1)
    .filter((row) => row.length > 1 || row[0] !== '')
    .map((row) => {
      const record = {};
      header.forEach((col, i) => {
        record[col] = row[i] ?? '';
      });
      return record;
    });
}

function parseRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function toCsv(records, columns) {
  const header = columns.map((c) => c.header).join(',');
  const lines = records.map((record) =>
    columns.map((c) => escapeCsvField(record[c.key])).join(',')
  );
  return [header, ...lines].join('\n') + '\n';
}

function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = Array.isArray(value) ? value.join('; ') : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
