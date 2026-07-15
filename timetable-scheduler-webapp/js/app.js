// AuraPlan - Premium Timetable & Resource Scheduler
// Unified Client-Side Application Core

// =========================================================================
// 1. SOLVER ENGINE (Simulated Annealing Optimizer)
// =========================================================================

function getDatesInRange(startDateStr, endDateStr) {
  const dates = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function getDayName(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function isResourceAbsent(resource, dateStr, defaultWeekends) {
  if (resource.absentDates && resource.absentDates.includes(dateStr)) {
    return true;
  }
  const dayName = getDayName(dateStr);
  if (defaultWeekends.sat && dayName === 'Saturday') return true;
  if (defaultWeekends.sun && dayName === 'Sunday') return true;
  return false;
}

function evaluateSchedule(state, dates, resources, departments, shiftHours, defaultWeekends) {
  let penalty = 0;
  const violations = [];

  const resourceTotalHours = {};
  const departmentTotalHours = {};
  const resourceDeptDays = {};

  resources.forEach(r => {
    resourceTotalHours[r.name] = 0;
    resourceDeptDays[r.name] = {};
    r.allowedDepartments.forEach(d => {
      resourceDeptDays[r.name][d] = 0;
    });
  });

  departments.forEach(d => {
    departmentTotalHours[d.name] = 0;
  });

  for (const resName of Object.keys(state)) {
    for (const dateStr of Object.keys(state[resName])) {
      const assignedDept = state[resName][dateStr];
      if (assignedDept && assignedDept !== 'Absent') {
        resourceTotalHours[resName] += shiftHours;
        departmentTotalHours[assignedDept] += shiftHours;
        if (resourceDeptDays[resName][assignedDept] !== undefined) {
          resourceDeptDays[resName][assignedDept]++;
        }
      }
    }
  }

  resources.forEach(r => {
    const hours = resourceTotalHours[r.name];
    
    if (hours < r.minHours) {
      const diff = r.minHours - hours;
      penalty += diff * 15;
      violations.push({
        description: `${r.name}: Under minimum hours`,
        reason: `Assigned ${hours} hours, but requires at least ${r.minHours} hours (shortage of ${diff} hours).`
      });
    }
    if (hours > r.maxHours) {
      const diff = hours - r.maxHours;
      penalty += diff * 15;
      violations.push({
        description: `${r.name}: Over maximum hours`,
        reason: `Assigned ${hours} hours, but maximum limit is ${r.maxHours} hours (excess of ${diff} hours).`
      });
    }

    r.allowedDepartments.forEach(dept => {
      const days = resourceDeptDays[r.name][dept] || 0;
      if (days > 0) {
        if (days < r.minDaysPerDept) {
          const diff = r.minDaysPerDept - days;
          penalty += diff * 10;
          violations.push({
            description: `${r.name} - ${dept}: Under min days`,
            reason: `Assigned ${days} days in ${dept}, but requires at least ${r.minDaysPerDept} days.`
          });
        }
        if (days > r.maxDaysPerDept) {
          const diff = days - r.maxDaysPerDept;
          penalty += diff * 10;
          violations.push({
            description: `${r.name} - ${dept}: Over max days`,
            reason: `Assigned ${days} days in ${dept}, but maximum allowed is ${r.maxDaysPerDept} days.`
          });
        }
      }
    });
  });

  departments.forEach(d => {
    const hours = departmentTotalHours[d.name];
    if (hours < d.minHours) {
      const diff = d.minHours - hours;
      penalty += diff * 20;
      violations.push({
        description: `Department ${d.name}: Under minimum hours`,
        reason: `Assigned total ${hours} hours, but requires at least ${d.minHours} hours (shortage of ${diff} hours).`
      });
    }
    if (hours > d.maxHours) {
      const diff = hours - d.maxHours;
      penalty += diff * 20;
      violations.push({
        description: `Department ${d.name}: Over maximum hours`,
        reason: `Assigned total ${hours} hours, but maximum allowed is ${d.maxHours} hours (excess of ${diff} hours).`
      });
    }
  });

  return { penalty, violations };
}

function solveSchedule(dates, resources, departments, shiftHours, defaultWeekends, existingSchedules = []) {
  const maxIterations = 15000;
  let temp = 100.0;
  const coolingRate = 0.998;
  
  let state = {};
  resources.forEach(r => {
    state[r.name] = {};
    dates.forEach(dateStr => {
      if (isResourceAbsent(r, dateStr, defaultWeekends)) {
        state[r.name][dateStr] = 'Absent';
      } else {
        state[r.name][dateStr] = null;
      }
    });
  });

  dates.forEach(dateStr => {
    resources.forEach(r => {
      if (state[r.name][dateStr] !== 'Absent') {
        if (Math.random() < 0.6) {
          const randomDept = r.allowedDepartments[Math.floor(Math.random() * r.allowedDepartments.length)];
          state[r.name][dateStr] = randomDept;
        }
      }
    });
  });

  function getCost(s) {
    let evalRes = evaluateSchedule(s, dates, resources, departments, shiftHours, defaultWeekends);
    let cost = evalRes.penalty;

    existingSchedules.forEach(prev => {
      let matches = 0;
      resources.forEach(r => {
        dates.forEach(d => {
          if (s[r.name][d] && s[r.name][d] !== 'Absent' && s[r.name][d] === prev[r.name]?.[d]) {
            matches++;
          }
        });
      });
      cost += matches * 25;
    });

    return cost;
  }

  let currentCost = getCost(state);
  let bestState = JSON.parse(JSON.stringify(state));
  let bestCost = currentCost;

  for (let i = 0; i < maxIterations; i++) {
    const randomRes = resources[Math.floor(Math.random() * resources.length)];
    const validDates = dates.filter(d => state[randomRes.name][d] !== 'Absent');
    if (validDates.length === 0) continue;
    const randomDate = validDates[Math.floor(Math.random() * validDates.length)];

    const oldVal = state[randomRes.name][randomDate];
    const options = [null, ...randomRes.allowedDepartments];
    const newVal = options[Math.floor(Math.random() * options.length)];

    if (oldVal === newVal) continue;

    state[randomRes.name][randomDate] = newVal;
    const newCost = getCost(state);

    const delta = newCost - currentCost;
    if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
      currentCost = newCost;
      if (newCost < bestCost) {
        bestCost = newCost;
        bestState = JSON.parse(JSON.stringify(state));
      }
    } else {
      state[randomRes.name][randomDate] = oldVal;
    }

    temp *= coolingRate;
    if (bestCost === 0) break;
  }

  const finalEval = evaluateSchedule(bestState, dates, resources, departments, shiftHours, defaultWeekends);

  return {
    schedule: bestState,
    violations: finalEval.violations,
    penalty: finalEval.penalty
  };
}

// =========================================================================
// 2. EXCEL CONTROLLER (Template Generator & Parser)
// =========================================================================

function downloadTemplate(globalSettings) {
  const wb = XLSX.utils.book_new();

  const settingsData = [
    ['Setting Name', 'Value', 'Description'],
    ['Start Date', globalSettings.startDate, 'The beginning of the planning horizon (YYYY-MM-DD)'],
    ['End Date', globalSettings.endDate, 'The end of the planning horizon (YYYY-MM-DD)'],
    ['Hours Per Shift', globalSettings.shiftHours, 'Work hours assigned to a resource for a day shift']
  ];
  const wsSettings = XLSX.utils.aoa_to_sheet(settingsData);
  XLSX.utils.book_append_sheet(wb, wsSettings, 'Settings');

  const deptsData = [
    ['Department Name', 'Min Total Hours', 'Max Total Hours'],
    ['Cardiology', 120, 200],
    ['Pediatrics', 80, 150],
    ['Emergency', 160, 240]
  ];
  const wsDepts = XLSX.utils.aoa_to_sheet(deptsData);
  XLSX.utils.book_append_sheet(wb, wsDepts, 'Departments');

  const resourcesData = [
    [
      'Resource Name', 
      'Allowed Departments', 
      'Min Hours', 
      'Max Hours', 
      'Min Days Per Dept', 
      'Max Days Per Dept', 
      'Specific Absent Dates'
    ],
    ['Dr. Alice', 'Cardiology, Emergency', 80, 160, 5, 15, '2026-07-10, 2026-07-11'],
    ['Dr. Bob', 'Pediatrics, Emergency', 60, 120, 3, 10, '2026-07-15'],
    ['Dr. Charlie', 'Cardiology, Pediatrics', 100, 160, 5, 15, '2026-07-20']
  ];
  const wsResources = XLSX.utils.aoa_to_sheet(resourcesData);
  XLSX.utils.book_append_sheet(wb, wsResources, 'Resources');

  XLSX.writeFile(wb, 'AuraPlan_Scheduler_Template.xlsx');
}

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const requiredSheets = ['Settings', 'Departments', 'Resources'];
        for (const sheet of requiredSheets) {
          if (!workbook.SheetNames.includes(sheet)) {
            throw new Error(`Missing required worksheet tab: "${sheet}". Please verify the template structure.`);
          }
        }

        const settingsSheet = workbook.Sheets['Settings'];
        const settingsRows = XLSX.utils.sheet_to_json(settingsSheet);
        const settings = {};
        
        settingsRows.forEach((row) => {
          const name = row['Setting Name'] || row['__EMPTY_0'];
          const val = row['Value'] || row['__EMPTY_1'];
          if (name) settings[name.trim()] = val;
        });

        if (!settings['Start Date'] || !settings['End Date']) {
          throw new Error('Settings sheet must specify both "Start Date" and "End Date".');
        }

        const deptsSheet = workbook.Sheets['Departments'];
        const deptsRows = XLSX.utils.sheet_to_json(deptsSheet);
        const departments = [];
        
        deptsRows.forEach((row, i) => {
          const rowNum = i + 2;
          const name = row['Department Name'];
          const minH = Number(row['Min Total Hours']);
          const maxH = Number(row['Max Total Hours']);

          if (!name) {
            throw new Error(`Validation Error [Departments Sheet, Row ${rowNum}]: Department Name is empty.`);
          }
          if (isNaN(minH) || minH < 0) {
            throw new Error(`Validation Error [Departments Sheet, Row ${rowNum}]: "Min Total Hours" must be a positive number.`);
          }
          if (isNaN(maxH) || maxH < minH) {
            throw new Error(`Validation Error [Departments Sheet, Row ${rowNum}]: "Max Total Hours" must be greater than or equal to Min Total Hours.`);
          }

          departments.push({ name: name.trim(), minHours: minH, maxHours: maxH });
        });

        if (departments.length === 0) {
          throw new Error('No departments found in the Departments sheet.');
        }

        const resourcesSheet = workbook.Sheets['Resources'];
        const resourcesRows = XLSX.utils.sheet_to_json(resourcesSheet);
        const resources = [];

        resourcesRows.forEach((row, i) => {
          const rowNum = i + 2;
          const name = row['Resource Name'];
          const allowedStr = row['Allowed Departments'] || '';
          const minH = Number(row['Min Hours']);
          const maxH = Number(row['Max Hours']);
          const minDays = Number(row['Min Days Per Dept']);
          const maxDays = Number(row['Max Days Per Dept']);
          const absentStr = row['Specific Absent Dates'] || '';

          if (!name) {
            throw new Error(`Validation Error [Resources Sheet, Row ${rowNum}]: Resource Name is empty.`);
          }
          if (isNaN(minH) || minH < 0) {
            throw new Error(`Validation Error [Resources Sheet, Row ${rowNum}]: "Min Hours" must be a positive number.`);
          }
          if (isNaN(maxH) || maxH < minH) {
            throw new Error(`Validation Error [Resources Sheet, Row ${rowNum}]: "Max Hours" must be greater than or equal to Min Hours.`);
          }
          if (isNaN(minDays) || minDays < 0) {
            throw new Error(`Validation Error [Resources Sheet, Row ${rowNum}]: "Min Days Per Dept" must be a positive number.`);
          }
          if (isNaN(maxDays) || maxDays < minDays) {
            throw new Error(`Validation Error [Resources Sheet, Row ${rowNum}]: "Max Days Per Dept" must be greater than or equal to Min Days Per Dept.`);
          }

          const allowedDepts = allowedStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
          if (allowedDepts.length === 0) {
            throw new Error(`Validation Error [Resources Sheet, Row ${rowNum}]: "Allowed Departments" must contain at least one valid department.`);
          }

          const absentDates = absentStr.toString().split(',').map(s => s.trim()).filter(s => s.length > 0);

          resources.push({
            name: name.trim(),
            allowedDepartments: allowedDepts,
            minHours: minH,
            maxHours: maxH,
            minDaysPerDept: minDays,
            maxDaysPerDept: maxDays,
            absentDates: absentDates
          });
        });

        if (resources.length === 0) {
          throw new Error('No resources found in the Resources sheet.');
        }

        const deptNames = new Set(departments.map(d => d.name));
        resources.forEach((res, i) => {
          res.allowedDepartments.forEach(dept => {
            if (!deptNames.has(dept)) {
              throw new Error(`Validation Error [Resources Sheet, Row ${i + 2}]: Department "${dept}" is listed under allowed departments, but does not exist in the Departments sheet.`);
            }
          });
        });

        resolve({
          settings: {
            startDate: settings['Start Date'].toString().trim(),
            endDate: settings['End Date'].toString().trim(),
            shiftHours: Number(settings['Hours Per Shift']) || 8
          },
          departments,
          resources
        });

      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read the Excel file.'));
    reader.readAsArrayBuffer(file);
  });
}

function exportScheduleToExcel(schedule, dates, resources) {
  const wb = XLSX.utils.book_new();
  
  const gridRows = [['Resource Name', ...dates]];
  resources.forEach(res => {
    const row = [res.name];
    dates.forEach(d => {
      row.push(schedule[res.name]?.[d] || '');
    });
    gridRows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(gridRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Generated Schedule');
  XLSX.writeFile(wb, 'AuraPlan_Generated_Schedule.xlsx');
}

// =========================================================================
// 3. UI RENDERING & LAYOUT ENGINE
// =========================================================================

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function showState(state) {
  const states = {
    initial: document.getElementById('state-initial'),
    loading: document.getElementById('state-loading'),
    results: document.getElementById('state-results'),
    error: document.getElementById('state-error')
  };

  Object.keys(states).forEach(key => {
    if (states[key]) {
      states[key].style.display = key === state ? 'flex' : 'none';
    }
  });

  initIcons();
}

function showError(title, message) {
  const errorTitle = document.getElementById('error-title');
  const errorMessage = document.getElementById('error-message');
  
  errorTitle.innerHTML = `<i data-lucide="x-circle"></i> ${title}`;
  errorMessage.textContent = message;
  
  showState('error');
}

function renderScheduleGrid(schedule, dates, resources) {
  const table = document.getElementById('schedule-results-table');
  table.innerHTML = '';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  
  const resourceHeader = document.createElement('th');
  resourceHeader.textContent = 'Resource / Date';
  headerRow.appendChild(resourceHeader);

  dates.forEach(dateStr => {
    const th = document.createElement('th');
    th.className = 'schedule-cell';
    const parts = dateStr.split('-');
    th.textContent = parts.length === 3 ? `${parts[1]}/${parts[2]}` : dateStr;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  resources.forEach(res => {
    const row = document.createElement('tr');
    
    const nameTd = document.createElement('td');
    nameTd.textContent = res.name;
    row.appendChild(nameTd);

    dates.forEach(dateStr => {
      const td = document.createElement('td');
      td.className = 'schedule-cell';

      const assignment = schedule[res.name] ? schedule[res.name][dateStr] : null;
      if (assignment) {
        if (assignment === 'Absent') {
          td.innerHTML = `<span class="cell-absent">Absent</span>`;
        } else {
          td.innerHTML = `<span class="cell-assigned">${assignment}</span>`;
        }
      } else {
        td.innerHTML = `<span class="schedule-cell-empty">-</span>`;
      }
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
}

function renderAlternates(alternatesCount, activeIndex, onSelect) {
  const container = document.getElementById('alternates-list');
  container.innerHTML = '';

  for (let i = 0; i < alternatesCount; i++) {
    const btn = document.createElement('button');
    btn.className = `btn ${i === activeIndex ? 'btn-primary' : 'btn-secondary'}`;
    btn.style.padding = '0.35rem 0.75rem';
    btn.style.fontSize = '0.8rem';
    btn.textContent = `Schedule #${i + 1}`;
    btn.addEventListener('click', () => onSelect(i));
    container.appendChild(btn);
  }
}

function renderViolations(violations) {
  const alertBox = document.getElementById('violations-alert-box');
  const container = document.getElementById('violations-list');
  
  if (!violations || violations.length === 0) {
    alertBox.style.display = 'none';
    return;
  }

  alertBox.style.display = 'flex';
  container.innerHTML = '';

  violations.forEach(v => {
    const div = document.createElement('div');
    div.className = 'violation-item';
    div.innerHTML = `
      <div class="violation-desc">${v.description}</div>
      <div class="violation-reason">${v.reason}</div>
    `;
    container.appendChild(div);
  });
}

// =========================================================================
// 4. COORDINATION & STATE ORCHESTRATION
// =========================================================================

let appData = null;
let generatedSchedules = [];
let activeScheduleIndex = 0;
let computedDates = [];

// DOM Elements
let inputStart, inputEnd, inputHours, absentSat, absentSun;
let btnDownload, btnUploadTrigger, inputExcel, btnRun, btnExport;
let modal, btnHowTo, btnCloseModal;

document.addEventListener('DOMContentLoaded', () => {
  // Bind inputs
  inputStart = document.getElementById('input-start-date');
  inputEnd = document.getElementById('input-end-date');
  inputHours = document.getElementById('input-shift-hours');
  absentSat = document.getElementById('absent-sat');
  absentSun = document.getElementById('absent-sun');

  // Bind Buttons
  btnDownload = document.getElementById('btn-download-template');
  btnUploadTrigger = document.getElementById('btn-upload-trigger');
  inputExcel = document.getElementById('input-excel-file');
  btnRun = document.getElementById('btn-run-solver');
  btnExport = document.getElementById('btn-export-schedule');

  // Bind Modal
  modal = document.getElementById('modal-how-to');
  btnHowTo = document.getElementById('btn-how-to');
  btnCloseModal = document.getElementById('btn-modal-close');

  // Event handlers
  btnDownload.addEventListener('click', handleDownloadTemplate);
  btnUploadTrigger.addEventListener('click', () => inputExcel.click());
  inputExcel.addEventListener('change', handleUploadExcel);
  btnRun.addEventListener('click', handleGenerateSchedule);
  btnExport.addEventListener('click', handleExportSchedule);

  btnHowTo.addEventListener('click', () => modal.classList.add('active'));
  btnCloseModal.addEventListener('click', () => modal.classList.remove('active'));
  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });

  initIcons();
});

function handleDownloadTemplate() {
  const settings = {
    startDate: inputStart.value,
    endDate: inputEnd.value,
    shiftHours: inputHours.value
  };
  downloadTemplate(settings);
}

async function handleUploadExcel(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    showState('loading');
    
    appData = await parseExcelFile(file);
    
    inputStart.value = appData.settings.startDate;
    inputEnd.value = appData.settings.endDate;
    inputHours.value = appData.settings.shiftHours;

    const statusBox = document.getElementById('upload-status');
    const statusDetails = document.getElementById('upload-status-details');
    statusBox.style.display = 'flex';
    statusDetails.textContent = `${appData.resources.length} Resources, ${appData.departments.length} Departments loaded.`;
    
    btnRun.disabled = false;
    showState('initial');
    
  } catch (err) {
    showError('Spreadsheet Parsing Failed', err.message);
    btnRun.disabled = true;
  } finally {
    inputExcel.value = '';
  }
}

async function handleGenerateSchedule() {
  if (!appData) return;

  showState('loading');
  generatedSchedules = [];
  activeScheduleIndex = 0;
  
  computedDates = getDatesInRange(inputStart.value, inputEnd.value);
  
  const defaultWeekends = {
    sat: absentSat.checked,
    sun: absentSun.checked
  };

  setTimeout(() => {
    try {
      const runsCount = 3;
      
      for (let run = 0; run < runsCount; run++) {
        const result = solveSchedule(
          computedDates,
          appData.resources,
          appData.departments,
          appData.settings.shiftHours,
          defaultWeekends,
          generatedSchedules.map(r => r.schedule)
        );
        generatedSchedules.push(result);
      }

      displayActiveSchedule();
      showState('results');

    } catch (err) {
      showError('Solver Failure', 'An error occurred during schedule computation: ' + err.message);
    }
  }, 100);
}

function displayActiveSchedule() {
  if (generatedSchedules.length === 0) return;

  const current = generatedSchedules[activeScheduleIndex];
  renderScheduleGrid(current.schedule, computedDates, appData.resources);
  
  renderAlternates(generatedSchedules.length, activeScheduleIndex, (idx) => {
    activeScheduleIndex = idx;
    displayActiveSchedule();
  });

  renderViolations(current.violations);
}

function handleExportSchedule() {
  if (generatedSchedules.length === 0) return;
  const current = generatedSchedules[activeScheduleIndex];
  exportScheduleToExcel(current.schedule, computedDates, appData.resources);
}
