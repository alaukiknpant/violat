const debug = require('debug')('outcomes');
const debugdetail = require('debug')('outcomes:detail');
const assert = require('assert');

const path = require('path');
const cp = require('child_process');
const fs = require('fs');
const ncp = require('ncp');

const config = require('./config.js');
const server = require('./server.js');
const linearization = require('./linearization.js');
const visibility = require('./visibility.js');

const Outcome = require('./outcome.js');
const Properties = require('./outcome-properties.js');
const PartialOrder = require('./partial-order.js');

let runjobjPath = path.resolve(config.resourcesPath, 'runjobj');
let workPath = path.resolve(config.outputPath, 'runjobj');
let runjobj = path.resolve(workPath, 'build/libs/runjobj.jar');

function compile() {
  return new Promise((resolve, reject) => {
    debug(`checking whether runjobj needs compiling`);

    if (fs.existsSync(runjobj)) {
      debug(`runjobj has already been compiled`);
      resolve();

    } else {
      debug(`recompiling runjobj`);
      ncp(runjobjPath, workPath, err => {
        if (err) {
          debug(`unable to copy runjobj: ${err}`);
          reject(err);
        } else {
          cp.exec(`gradle`, {cwd: workPath}, (rc, out, err) => {
            if (rc) {
              debug(`unable to build runjobj: ${err}`);
              reject(err);
            } else {
              resolve();
            }
          });
        }
      });
    }
  });
}

async function getOutcomes(executor, schema, weak) {
  debug(`computing outcomes for schema:`);
  debug(schema);

  let outcomes = [];
  let programOrder = getProgramOrder(schema);
  indexInvocations(schema);

  debugdetail(`using happens before:`);
  debugdetail(programOrder);

  for (let lin of linearization(programOrder, false)) {
    debugdetail(`using linearization:`);
    debugdetail(lin);

    for (let viz of visibility(programOrder, lin, weak)) {
      debugdetail(`using visibility:`);
      debugdetail(viz);

      let outcome = await getOutcome(executor, schema, lin, viz, false);
      debug(`computed outcome:`);
      debug(outcome);

      outcomes.push(outcome);
    }
  }
  debug(`got ${outcomes.length} total outcomes`);
  debug(outcomes);

  let unique = Outcome.minimals(outcomes);
  debug(`got ${unique.length} unique outcomes`);
  debug(unique);

  return unique;
}

function indexInvocations(schema) {
  let count = 0;
  for (let sequence of schema.sequences) {
    for (let invocation of sequence.invocations) {
      invocation.index = count++;
    }
  }
}

function getProgramOrder(schema) {
  let order = new PartialOrder();
  for (let sequence of schema.sequences) {
    let predecessor;
    for (let invocation of sequence.invocations) {
      order.add(invocation);
      if (predecessor)
        order.sequence(predecessor, invocation);
      predecessor = invocation;
    }
  }

  for (let [s1,s2] of schema.order)
    order.sequence(
      s1.invocations[s1.invocations.length-1],
      s2.invocations[0]);

  return order;
}

async function getOutcome(executor, schema, linearization, visibility, weak) {
  let cummulativeOutcome = Outcome.empty();

  let prefix = [];
  for (let invocation of linearization.sequence) {
    prefix.push(invocation);
    let projection = prefix.filter(i => visibility.isVisible(i, invocation));
    let outcome = await getSimpleOutcome(executor, schema, projection);
    cummulativeOutcome = cummulativeOutcome.merge(outcome);
  }
  cummulativeOutcome.properties.merge(linearization.properties);
  cummulativeOutcome.properties.merge(visibility.properties);
  return cummulativeOutcome;
}

async function getSimpleOutcome(executor, schema, invocations) {
  let returns = await executor.query(getQuerySequence(schema, invocations));
  debugdetail(`got executor results`);
  debugdetail(returns);

  let results = invocations.reduce((outcome, invocation, index) =>
    Object.assign({}, outcome, {[invocation.index]: returns[index]}), {});

  return new Outcome(results, Properties.empty());
}

function getQuerySequence(schema, invocations) {
  return {
    class: schema.class,
    constructor: {
      parameters: []
    },
    arguments: [],
    invocations: invocations
  };
}

module.exports = function(schemas, weak) {
  return new Promise(async (resolve, reject) => {
    await compile();

    debug(`annotating ${schemas.length} harness schemas`);

    let executor = server(runjobj);

    for (let schema of schemas) {
      schema.outcomes = [];
      for (let outcome of await getOutcomes(executor, schema, weak)) {
        let properties = outcome.properties.get();
        schema.outcomes.push({
          values: Object.values(outcome.results),
          expected: properties.length ? undefined : true,
          description: properties.length ? properties.join(", ") : "atomic"
        });
      }
    }

    executor.close();

    let annotated = schemas;
    debug(`annotated ${annotated.length} harness schemas`);
    resolve(annotated);
  });
}