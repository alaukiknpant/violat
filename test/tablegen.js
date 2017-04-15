let fs = require('fs');
let files = process.argv.splice(2);

function getData(file) {
  let code = fs.readFileSync(file).toString();
  let data = JSON.parse(
    code
    .split('\n').filter(l => l.match(/^[/]{2}/))
    .map(s => s.slice(3))
    .join('\n'));

  let harness = code.split('\n').filter(l => !l.match(/^[/]{2}/)).join('\n');
  return Object.assign(data, {harness: harness});
}

function formatHarness(code, method) {
  let actors =
    code.split('@Actor')
    .splice(1)
    .map(a =>
      a.split('\n')
      .filter(line => line.match(/obj[.]/))
      .map(line => line.replace(/result\.r. = ResultAdapter.get\((.*)\)/, '$1'))
      .map(line => line.trim().replace(/;/,''))
      .map(line => line.replace(/obj[.]/,''))
      .map(line => line.replace(/offerLast/,'offer'))
      .map(line => line.replace(/pollFirst/, 'poll'))
      .map(line => line.replace(/Arrays.asList\(([^)]*)\)/, '[$1]'))
      .map(line => line.replace(/Collections.unmodifiableMap\(Stream.of\(new AbstractMap.SimpleEntry<>\((.*),(.*)\), new AbstractMap.SimpleEntry<>\((.*),(.*)\)\).collect.*/,'\\{$1=$2,$3=$4\\})'))
      .map(line => line.replace(/\s/,''))
      .map(line => line.replace(new RegExp(`(${method})`),'{\\bf $1}'))
    );

  return actors.map(a => `[${a.join('; ')}]`).join(',');
}

function formatOutcome(code) {
  return code
    .replace(/true/g, 'T')
    .replace(/false/g, 'F')
    .replace(/null/g, 'N')
    .replace(/NoSuchElementException/g, 'E')
    .replace(/\s/g,'');
}

function formatRow(data) {
  return `${data.invocations}, ${data.sequences}, ${data.values}
    & ${data.explored.toLocaleString()} / ${data.total.toLocaleString()}
    & \\tt ${formatHarness(data.harness, data.method)}
    & \\tt ${formatOutcome(data.results[0].outcome)}
    & ${data.results[0].count.toLocaleString()} / ${data.numExecutions.toLocaleString()}
    & ${parseInt(data.time).toFixed(0)}s
    \\\\`.replace(/\s+/g, ' ');
}

function formatHeader(className, firstInTable) {
  if (firstInTable)
    return `\\multicolumn{6}{c}{${className}} \\\\
      \\multicolumn{2}{c}{enumeration} & \\multicolumn{3}{c}{failure} & \\\\
      \\cmidrule(lr){1-2} \\cmidrule(lr){3-5}
      \\#I, \\#S, \\#V & exp / gen & harness & outcome & frequency & time \\\\
      \\cmidrule(lr){1-6}`.replace(/^\s+/mg,'');
  else
    return `\\midrule
      \\multicolumn{6}{c}{${className}} \\\\
      \\cmidrule(lr){1-6}`.replace(/^\s+/mg,'');
}

function frontMatter() {
  return `\\begin{tabular}{ccllrr}
    \\toprule`.replace(/^\s+/mg,'');
}

function endMatter() {
  return `\\bottomrule
    \\end{tabular}`.replace(/^\s+/mg,'');
}

let TABLES = [
  [
    'ConcurrentHashMap',
    'ConcurrentSkipListMap',
    'ConcurrentSkipListSet',
    'ConcurrentLinkedQueue',
    'LinkedTransferQueue'
  ],
  [
    'LinkedBlockingQueue',
    'ArrayBlockingQueue',
    'PriorityBlockingQueue',
    'LinkedBlockingDeque',
    'ConcurrentLinkedDeque'
  ]
];

(async () => {
  let results = {};

  for (let fileName of files) {
    let className = fileName.replace(/.*[/]([^/]*((List|Hash)Map|(List|Hash)Set|Queue|Deque)).*Test[0-9]+.java/,'$1');
    let data = getData(fileName);

    results[className] = results[className] || [];
    results[className].push(formatRow(data));
  }

  for (let table of TABLES) {
    let firstInTable = true;
    console.log(`---`);
    console.log(`TABLE`);
    console.log(`---`);
    console.log(frontMatter());
    for (let className of table) {
      console.log(formatHeader(className, firstInTable));
      for (let row of results[className])
        console.log(row);
      firstInTable = false;
    }
    console.log(endMatter());
  }

})();
