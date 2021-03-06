/** @prettier */
import { Subscription } from '../Subscription';
import { OperatorFunction, SubscribableOrPromise } from '../types';
import { operate } from '../util/lift';
import { from } from '../observable/from';
import { OperatorSubscriber } from './OperatorSubscriber';
import { noop } from '../util/noop';
import { arrRemove } from '../util/arrRemove';

/**
 * Buffers the source Observable values starting from an emission from
 * `openings` and ending when the output of `closingSelector` emits.
 *
 * <span class="informal">Collects values from the past as an array. Starts
 * collecting only when `opening` emits, and calls the `closingSelector`
 * function to get an Observable that tells when to close the buffer.</span>
 *
 * ![](bufferToggle.png)
 *
 * Buffers values from the source by opening the buffer via signals from an
 * Observable provided to `openings`, and closing and sending the buffers when
 * a Subscribable or Promise returned by the `closingSelector` function emits.
 *
 * ## Example
 *
 * Every other second, emit the click events from the next 500ms
 *
 * ```ts
 * import { fromEvent, interval, EMPTY } from 'rxjs';
 * import { bufferToggle } from 'rxjs/operators';
 *
 * const clicks = fromEvent(document, 'click');
 * const openings = interval(1000);
 * const buffered = clicks.pipe(bufferToggle(openings, i =>
 *   i % 2 ? interval(500) : EMPTY
 * ));
 * buffered.subscribe(x => console.log(x));
 * ```
 *
 * @see {@link buffer}
 * @see {@link bufferCount}
 * @see {@link bufferTime}
 * @see {@link bufferWhen}
 * @see {@link windowToggle}
 *
 * @param {SubscribableOrPromise<O>} openings A Subscribable or Promise of notifications to start new
 * buffers.
 * @param {function(value: O): SubscribableOrPromise} closingSelector A function that takes
 * the value emitted by the `openings` observable and returns a Subscribable or Promise,
 * which, when it emits, signals that the associated buffer should be emitted
 * and cleared.
 * @return {Observable<T[]>} An observable of arrays of buffered values.
 * @name bufferToggle
 */
export function bufferToggle<T, O>(
  openings: SubscribableOrPromise<O>,
  closingSelector: (value: O) => SubscribableOrPromise<any>
): OperatorFunction<T, T[]> {
  return operate((source, subscriber) => {
    const buffers: T[][] = [];

    // Subscribe to the openings notifier first
    from(openings).subscribe(
      new OperatorSubscriber(
        subscriber,
        (openValue) => {
          const buffer: T[] = [];
          buffers.push(buffer);
          // We use this composite subscription, so that
          // when the closing notifier emits, we can tear it down.
          const closingSubscription = new Subscription();

          // This is captured here, because we emit on both next or
          // if the closing notifier completes without value.
          // TODO: We probably want to not have closing notifiers emit!!
          const emit = () => {
            arrRemove(buffers, buffer);
            subscriber.next(buffer);
            closingSubscription.unsubscribe();
          };

          // The line below will add the subscription to the parent subscriber *and* the closing subscription.
          closingSubscription.add(from(closingSelector(openValue)).subscribe(new OperatorSubscriber(subscriber, emit, undefined, emit)));
        },
        undefined,
        noop
      )
    );

    source.subscribe(
      new OperatorSubscriber(
        subscriber,
        (value) => {
          // Value from our source. Add it to all pending buffers.
          for (const buffer of buffers) {
            buffer.push(value);
          }
        },
        undefined,
        () => {
          // Source complete. Emit all pending buffers.
          while (buffers.length > 0) {
            subscriber.next(buffers.shift()!);
          }
          subscriber.complete();
        }
      )
    );
  });
}
