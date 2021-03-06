import * as assert from 'assert';
import * as Debug from 'debug';
const debug = Debug('partialorder');
const detail = Debug('partialorder:detail');
const trace = Debug('partialorder:trace');

export class PartialOrder<T> {
  basis: Map<T,Set<T>>;
  closure: Map<T,Set<T>>;

  constructor() {
    this.basis = new Map();
    this.closure = new Map();
  }

  getBasis(n: T) {
    let ns = this.basis.get(n);
    assert.ok(ns);
    return ns as Set<T>;
  }

  getClosure(n: T): Set<T> {
    let ns = this.closure.get(n);
    assert.ok(ns);
    return ns as Set<T>;
  }

  static from<T>(iterable: Iterable<T>) {
    let that = new PartialOrder<T>();
    let last;
    for (let item of iterable) {
      that.add(item);
      if (last)
        that.sequence(last, item);
      last = item;
    }
    trace(`from( %s ) = %s`, [...iterable].join('; '), that);
    return that;
  }

  toString() {
    return `{ ${[...this.closure.entries()].map(([n,preds]) => `${n} > {${[...preds].join(', ')}}`).join('; ')} }`;
  }

  add(n: T) {
    this.basis.has(n) || this.basis.set(n, new Set());
    this.closure.has(n) || this.closure.set(n, new Set());
  }

  sequence(n1: T, n2: T) {
    this.add(n1);
    this.add(n2);
    this.getBasis(n2).add(n1);

    let before = Array.from(this.getClosure(n1));
    let after = Array.from(this.closure.entries())
      .filter(([_,ns]) => ns.has(n2)).map(([n,_]) => n);
    before.push(n1)
    after.push(n2);

    for (let succ of after)
      for (let pred of before)
        this.getClosure(succ).add(pred);
  }

  drop(node: T) {
    let that = new PartialOrder<T>();
    let predsOfNode = this.basis.get(node);

    for (let [succ,preds] of this.basis.entries()) {
      if (succ != node) {
        that.add(succ);
        for (let pred of preds)
          if (pred === node)
            this.getBasis(node).forEach(pp => that.sequence(pp, succ));
          else
            that.sequence(pred, succ);
      }
    }
    return that;
  }

  before(node: T) {
    let result = Array.from(this.getClosure(node));
    trace(`%s.before(%s) = { %s }`, this, node, result.join(', '));
    return result;
  }

  isBefore(n1: T, n2: T) {
    let result = this.getClosure(n2).has(n1);
    trace(`%s.isBefore(%s, %s) = %s`, this, n1, n2, result);
    return result;
  }

  values() {
    return Array.from(this.basis.keys());
  }

  minimals() {
    return this.values().filter(n => this.getBasis(n).size == 0);
  }

  * linearizations() {
    let count = 0;
    let workList: [T[], PartialOrder<T>][] = [];
    workList.push([[], this]);
    while (workList.length) {
      let [seq, po] = workList.pop() as [T[], PartialOrder<T>];

      if (po.values().length) {
        detail(`partial linearization %s with remainder %s`, seq, po);
        for (let min of po.minimals())
          workList.push([seq.concat(min), po.drop(min)]);

      } else {
        detail(`generated %s`, seq);
        count++;
        yield seq;
      }
    }
    debug(`generated ${count} linearizations`);
  }
}
