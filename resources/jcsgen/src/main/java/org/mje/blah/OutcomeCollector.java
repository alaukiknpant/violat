package org.mje.blah;

import java.lang.reflect.*;
import java.util.*;
import java.util.logging.*;
import java.util.stream.*;

public class OutcomeCollector {
    static Logger logger = Logger.getLogger("outcomes");

    boolean weakAtomicity;
    boolean relaxReturns;

    public OutcomeCollector(boolean weakAtomicity, boolean relaxReturns) {
        this.weakAtomicity = weakAtomicity;
        this.relaxReturns = weakAtomicity && relaxReturns;
    }

    public Set<SortedMap<Integer,String>> collect(Harness harness) {
        logger.fine("computing outcomes for harness:\n" + harness);
        logger.fine("weak atomicity: " + weakAtomicity);
        logger.fine("relax returns: " + relaxReturns);

        Set<SortedMap<Integer,String>> outcomes = collect(
            harness.getConstructor(), harness.getSequences(), harness.getNumbering());

        logger.fine("got " + outcomes.size() + " unique outcomes: " + outcomes);
        return outcomes;
    }

    public Set<SortedMap<Integer,String>> collect(
            Invocation constructor,
            PartialOrder<InvocationSequence> sequences,
            Map<Invocation,Integer> numbering) {

        Set<SortedMap<Integer,String>> outcomes = new HashSet<>();

        for (InvocationSequence linearization : Linearization.enumerate(sequences)) {
            logger.finer("linearization: " + linearization);
            outcomes.addAll(collect(constructor, linearization, numbering));
        }
        return outcomes;
    }

    public Set<SortedMap<Integer,String>> collect(
            Invocation constructor,
            InvocationSequence sequence,
            Map<Invocation,Integer> numbering) {

        Set<SortedMap<Integer,String>> outcomes = new HashSet<>();

        for (Visibility visibility : Visibility.enumerate(sequence, weakAtomicity)) {
            logger.finer("visibility: " + visibility);
            SortedMap<Integer,String> outcome = execute(constructor, sequence, visibility, numbering);
            logger.finer("outcome: " + outcome);
            if (outcome != null)
                outcomes.add(outcome);
        }
        return outcomes;
    }

    SortedMap<Integer,String> execute(
            Invocation constructor,
            InvocationSequence sequence,
            Visibility visibility,
            Map<Invocation,Integer> numbering) {

        if (visibility.isComplete()) {
            return execute(constructor, sequence, numbering);

        } else {
            SortedMap<Integer,String> outcome = null;

            for (int i=1; i<=sequence.size(); i++) {
                InvocationSequence prefix = sequence.prefix(i);
                Invocation last = prefix.last();
                InvocationSequence projection = prefix.projection(visibility.visibleSet(last));
                logger.finest("prefix / projection: " + prefix + " / " + projection);

                SortedMap<Integer,String> newOutcome = execute(constructor, projection, numbering);
                logger.finest("projected outcome: " + newOutcome);

                outcome = combineOutcomes(outcome, newOutcome);
                logger.finest("cummulative outcome: " + outcome);

                if (outcome == null)
                    return null;
            }
            return outcome;
        }
    }

    SortedMap<Integer,String> execute(
            Invocation constructor,
            InvocationSequence sequence,
            Map<Invocation,Integer> numbering) {

        SortedMap<Integer,String> outcome = new TreeMap<>();
        try {
            Object obj = constructor.invoke();
            for (Invocation i : sequence.getInvocations())
                outcome.put(numbering.get(i), Results.of(i.invoke(obj)));

        } catch (Exception e) {
            throw new RuntimeException("BAD CLASSES: " + e);
        }
        return outcome;
    }

    SortedMap<Integer,String> combineOutcomes(
            SortedMap<Integer,String> base,
            SortedMap<Integer,String> extension) {

        if (base == null)
            return extension;

        SortedMap<Integer,String> combined = new TreeMap<>(base);
        for (int id : extension.keySet()) {
            if (!base.containsKey(id))
                combined.put(id, extension.get(id));
            else if (!compatibleReturnValue(id, extension.get(id), base.get(id)))
                return null;
        }
        return combined;
    }

    boolean compatibleReturnValue(Integer id, String r1, String r2) {
        return relaxReturns || r1.equals(r2);
    }
}