import {asHours} from 'pomeranian-durations'
import setHours from 'date-fns/fp/setHours'
import getHours from 'date-fns/fp/getHours'
import getMinutes from 'date-fns/fp/getMinutes'
import areIntervalsOverlapping from 'date-fns/areIntervalsOverlapping'
import isWithinInterval from 'date-fns/fp/isWithinInterval'
import isSameDay from 'date-fns/fp/isSameDay'
import isEqual from 'date-fns/fp/isEqual'
import isAfter from 'date-fns/fp/isAfter'
import isBefore from 'date-fns/fp/isBefore'
import endOfWeek from 'date-fns/fp/endOfWeek'
import startOfDay from 'date-fns/fp/startOfDay'
import endOfDay from 'date-fns/fp/endOfDay'
import addDays from 'date-fns/fp/addDays'
import getDayOfYear from 'date-fns/getDayOfYear'

export function flatten(list) {
  var value, jlen, j
  var result = []
  var idx = 0
  var ilen = list.length

  while (idx < ilen) {
    if (Array.isArray(list[idx])) {
      value = list[idx]
      j = 0
      jlen = value.length
      while (j < jlen) {
        result[result.length] = value[j]
        j += 1
      }
    } else {
      result[result.length] = list[idx]
    }
    idx += 1
  }
  return result
}

export function debounce(func, wait, immediate) {
  var timeout
  return function() {
    var context = this,
      args = arguments
    var later = function() {
      timeout = null
      if (!immediate) func.apply(context, args)
    }
    var callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) func.apply(context, args)
  }
}

export function range(start, stop, step) {
  if (stop == null) {
    stop = start || 0
    start = 0
  }
  step = step || 1

  const length = Math.max(Math.ceil((stop - start) / step), 0)
  const range = Array(length)

  for (let idx = 0; idx < length; idx++, start += step) {
    range[idx] = start
  }
  return range
}

export const around = number => (number * 2).toFixed() / 2

// Gives the absolute positioning of the events
export function placeEvents(renderableIndexes, nodes, events, rowHeight, startHour, endHour) {
  const sh = asHours(startHour)
  const eh = asHours(endHour)
  return renderableIndexes.map(i => {
    const {start, end} = events[i]
    const {level, depth, children} = nodes[i]
    const ratio = 100 / depth
    const hoursToMinutes = entry => around((getHours(entry) - sh) * 60) + getMinutes(entry)
    const boundedStart = isBefore(setHours(sh, start), start) ? 0 : hoursToMinutes(start)
    const boundedEnd = isAfter(setHours(eh, end), end)
      ? around((eh - sh) * 60)
      : hoursToMinutes(end)

    return {
      key: i,
      event: events[i],
      style: {
        position: 'absolute',
        top: rowHeight * around(boundedStart / 60),
        left: `${level * ratio}%`,
        width: children.length === 0 ? `${100 - level * ratio}%` : `${ratio + 0.7 * ratio}%`,
        height: rowHeight * around((boundedEnd - boundedStart) / 60),
      },
    }
  })
}

export function computeNow(wrapper, startHour, endHour, now) {
  const diffDayMin = around((asHours(endHour) - asHours(startHour)) * 60)
  const diffMin = around((getHours(now) - asHours(startHour)) * 60) + getMinutes(now)
  const top = around(diffMin * wrapper.height / diffDayMin)
  return {
    position: 'absolute',
    top,
    left: 0,
    width: '100%',
  }
}

// The interval is time based so we also pass the day
export const checkBound = (day, int) => event =>
  (isWithinInterval(int, event.start) && isSameDay(event.end, day)) ||
  (isWithinInterval(int, event.end) && isSameDay(event.start, day))

export const checkIn = int => event =>
  areIntervalsOverlapping(event, int) && !isSameDay(event.start, event.end)

export function getTodayEvents(startHour, endHour, day, data) {
  const check = checkBound(day, {
    start: setHours(asHours(startHour), day),
    end: setHours(asHours(endHour), day),
  })
  return data.filter(check)
}
export function getWeekEvents(startingDay, showWeekend, startWeek, data) {
  const int = {
    start: startWeek,
    end: showWeekend ? endOfWeek(startWeek, {weekStartsOn: startingDay}) : addDays(4, startWeek),
  }
  return [
    ...data.filter(e => typeof e.allDay !== 'boolean' && isWithinInterval(int, e.allDay)),
    ...data.filter(e => typeof e.allDay === 'boolean' && checkIn(int)(e)),
  ]
}

export function getDayEvents(day, data) {
  const int = {
    start: startOfDay(day),
    end: endOfDay(day),
  }
  return [
    ...data.filter(e => typeof e.allDay !== 'boolean' && isWithinInterval(int, e.allDay)),
    ...data.filter(e => typeof e.allDay === 'boolean' && checkIn(int)(e)),
  ]
}

// Creates the tree used for the daily "stairs" layout algorithm, i.e. specify which nodes are child
// of which node
// It also assigns for each node it's level (position on each branch) and depth (length of the
// branch)
export function constructTree(data) {
  // Tag nodes picked in the tree so that they are only used once
  const pickedNodes = {}
  let nodes = {}
  const findChildren = id => {
    const child = []
    const currentNode = data[id]
    for (let i = 0; i < data.length; i++) {
      const targetNode = data[i]
      if (
        areIntervalsOverlapping(currentNode, targetNode) &&
        (isAfter(currentNode.start, targetNode.start) ||
          (isEqual(currentNode.start, targetNode.start) &&
            currentNode.id !== targetNode.id &&
            pickedNodes[i] !== true))
      ) {
        pickedNodes[i] = true
        child.push(i)
      }
    }
    return child
  }
  const makeNode = (level, id) => {
    const children = findChildren(id)
    children.map(n => {
      if (typeof nodes[n] === 'undefined') {
        nodes[n] = makeNode(level + 1, n)
      } else {
        if (nodes[n].level < level + 1) nodes[n].level = level + 1
      }
    })
    return {
      children,
      level,
      depth: 1,
    }
  }
  const getMaxDepth = TNodes =>
    TNodes.reduce((acc, node) => {
      const {level} = nodes[node]
      const c = getMaxDepth(nodes[node].children)
      const p = level < c ? c : level
      return acc < p ? p : acc
    }, 0)

  // Recursively set the children's depth
  const setChildrenDepth = (max, TNodes) =>
    TNodes.map(n => {
      // TODO investigate the need of the ternary, setting depth to max seems correct
      nodes[n].depth = nodes[n].depth < max ? max : nodes[n].depth
      setChildrenDepth(max, nodes[n].children)
    })

  // We first pick the root nodes, i.e. the ones that will be of level 0, that are not children
  // of any other node, and immediately, its children (and children's children, so they are not
  // picked
  const rootNodes = []
  for (let i = 0; i < data.length; i++) {
    if (pickedNodes[i] === true) continue // bail out if the node has already been picked

    let isOverlapping = false
    for (let j = 0; j < rootNodes.length; j++) {
      isOverlapping = isOverlapping || areIntervalsOverlapping(data[i], data[rootNodes[j]])
    }
    if (isOverlapping === false) {
      pickedNodes[i] = true

      rootNodes.push(i)
      if (typeof nodes[i] === 'undefined') nodes[i] = makeNode(0, i)
      const maxDepth = getMaxDepth(nodes[i].children) + 1
      nodes[i].depth = maxDepth
      setChildrenDepth(maxDepth, nodes[i].children)
    }
  }
  return nodes
}

/**
 * Split the items between allDay one and not, and construct the tree of nodes for the daily "stairs" layout
 *  algorithm
 * @param {Array<Events>} data The array of events passed by the user
 */
export function parseData(data) {
  let events = data.filter(e => typeof e.allDay === 'boolean' && e.allDay === false)
  events.sort((a, b) => {
    if (getHours(a.start) === getHours(b.start)) {
      return getHours(b.end) - getHours(b.start) - (getHours(a.end) - getHours(a.start))
    }
    return isAfter(a.start, b.start) ? -1 : 1
  })

  const fevents = data.filter(e => e.allDay)
  return {
    events,
    fevents,
    nodes: constructTree(events),
  }
}
