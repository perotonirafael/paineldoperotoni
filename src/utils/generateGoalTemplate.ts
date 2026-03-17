import * as XLSX from 'xlsx';

export function generateGoalTemplate() {
  const data = [
    // Headers
    ['Produto', 'ID Usuário', 'Rubrica', 'Ano', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', 'Total Ano'],
    
    // ETN 1 - 2025
    ['HCM Senior', '11124', 'Setup + Licenças', '2025', 50000, 45000, 60000, 55000, 70000, 65000, 50000, 55000, 60000, 70000, 65000, 75000, 720000],
    ['HCM Senior', '11124', 'Serviços Não Recorrentes', '2025', 30000, 28000, 35000, 32000, 40000, 38000, 30000, 32000, 35000, 40000, 38000, 42000, 420000],
    ['HCM Senior', '11124', 'Recorrente', '2025', 20000, 20000, 22000, 22000, 25000, 25000, 20000, 22000, 22000, 25000, 25000, 28000, 276000],
    
    // ETN 1 - 2026
    ['HCM Senior', '11124', 'Setup + Licenças', '2026', 55000, 50000, 65000, 60000, 75000, 70000, 55000, 60000, 65000, 75000, 70000, 80000, 780000],
    ['HCM Senior', '11124', 'Serviços Não Recorrentes', '2026', 33000, 30000, 38000, 35000, 43000, 40000, 33000, 35000, 38000, 43000, 40000, 45000, 453000],
    ['HCM Senior', '11124', 'Recorrente', '2026', 22000, 22000, 24000, 24000, 27000, 27000, 22000, 24000, 24000, 27000, 27000, 30000, 300000],
    
    // ETN 2 - 2025
    ['HCM Senior', '3571', 'Setup + Licenças', '2025', 40000, 38000, 45000, 42000, 50000, 48000, 40000, 42000, 45000, 50000, 48000, 55000, 543000],
    ['HCM Senior', '3571', 'Serviços Não Recorrentes', '2025', 25000, 22000, 28000, 26000, 32000, 30000, 25000, 26000, 28000, 32000, 30000, 35000, 339000],
    ['HCM Senior', '3571', 'Recorrente', '2025', 15000, 15000, 18000, 18000, 20000, 20000, 15000, 18000, 18000, 20000, 20000, 22000, 219000],
    
    // ETN 2 - 2026
    ['HCM Senior', '3571', 'Setup + Licenças', '2026', 44000, 42000, 50000, 46000, 55000, 52000, 44000, 46000, 50000, 55000, 52000, 60000, 596000],
    ['HCM Senior', '3571', 'Serviços Não Recorrentes', '2026', 28000, 25000, 30000, 28000, 35000, 33000, 28000, 28000, 30000, 35000, 33000, 38000, 371000],
    ['HCM Senior', '3571', 'Recorrente', '2026', 17000, 17000, 20000, 20000, 22000, 22000, 17000, 20000, 20000, 22000, 22000, 25000, 244000],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  ws['!cols'] = [
    { wch: 16 }, // Produto
    { wch: 12 }, // ID Usuário
    { wch: 28 }, // Rubrica
    { wch: 6 },  // Ano
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, // Jan-Abr
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, // Mai-Ago
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, // Set-Dez
    { wch: 12 }, // Total
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Metas');
  XLSX.writeFile(wb, 'modelo_metas_multi_ano.xlsx');
}
