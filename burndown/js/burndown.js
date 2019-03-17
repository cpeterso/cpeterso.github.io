;((exports) => {
    "use strict";

    // https://www.mozilla.org/en-US/styleguide/identity/firefox/color/
    const FIREFOX_ORANGE = "#E66000";
    const FIREFOX_LIGHT_ORANGE = "#FF9500";
    const FIREFOX_YELLOW = "#FFCB00";
    const FIREFOX_BLUE = "#00539F";
    const FIREFOX_LIGHT_BLUE = "#0095DD";
    const FIREFOX_LIGHT_BLUE_GREY1 = "#EAEFF2";
    const FIREFOX_LIGHT_BLUE_GREY2 = "#D4DDE4";
    const FIREFOX_DARK_BLUE_GREY1 = "#424F5A";
    const FIREFOX_DARK_BLUE_GREY2 = "#6A7B86";

    const MS_PER_DAY = 24*60*60*1000;
    const MS_PER_WEEK = 7*MS_PER_DAY;
    const MS_PER_MONTH = 4*MS_PER_WEEK;

    const DEBUG = true;
    function debug(...args) { DEBUG && console.debug(...args); }

    function days(d) { return d * MS_PER_DAY; }
    function weeks(w) { return days(7 * w); }
    function months(m) { return weeks(4 * m); }

    const queryString = getQueryString();
    const chartStartDate = getChartStartDate();

    function getQueryString() {
        // e.g. "?foo=bar&baz=qux&/"
        let qs = window.location.search;
        if (qs.length <= 1) {
            return "";
        }
        const slash = (qs[qs.length - 1] === '/') ? -1 : undefined;
        return qs.slice(1, slash);
    }

    function getChartStartDate() {
      const CHART_START_PERIOD = months(3);
      const searchParams = parseQueryString(queryString);
      return searchParams.since ||
             yyyy_mm_dd(new Date(Date.now() - CHART_START_PERIOD));

      function parseQueryString(qs) {
          // e.g. "foo=bar&baz=qux&"
          const kvs = {};
          const params = qs.split("&");
          _.forEach(params, kv => {
              kv = kv.split("=", 2);
              const key = kv[0].toLowerCase();
              if (key.length === 0) {
                  return; // "&&"
              }
              const value = (kv.length > 1) ? decodeURIComponent(kv[1]) : null;
              kvs[key] = value;
          });
          return kvs;
      }
    }

    function getElementValue(id) {
        return document.getElementById(id).value;
    }

    function yyyy_mm_dd(date) {
        return date.toISOString().slice(0,10);
    }

    function drawChart(data) {
        c3.generate({
            data: {
                x: "x",
                columns: [
                    ["x", ...data.dates],
                    ["closedBugCounts", ...data.closedBugCounts],
                    ["openBugCounts", ...data.openBugCounts],
                ],
                names: {
                    openBugCounts: "Open Bugs",
                    closedBugCounts: "Closed Bugs",
                },
                types: {
                    openBugCounts: "area",
                    closedBugCounts: "area",
                },
                colors: {
                    openBugCounts: FIREFOX_LIGHT_ORANGE,
                    closedBugCounts: FIREFOX_LIGHT_BLUE,
                },
                groups: [
                    ["openBugCounts", "closedBugCounts"],
                ],
                order: null,
            },
            axis: {
                x: {
                    type: "timeseries",
                    tick: {
                        format: "%Y-%m-%d",
                    }
                }
            },
        });
    }

    function createElement(tag, child) {
        const element = document.createElement(tag);
        if (typeof child !== "undefined") {
            if (typeof child !== "object") {
                child = document.createTextNode(child.toString());
            }
            element.appendChild(child);
        }
        return element;
    }

    function createLink(text, url) {
        const element = createElement("a", text);
        element.setAttribute("href", url);
        return element;
    }

    function setErrorText(msg) {
        let chart = document.getElementById("chart");
        chart.innerText = msg;
    }

    function searchAndPlotBugs() {
        const t0 = Date.now();
        debug(`searchAndPlotBugs: ${queryString}`);

        $bugzilla.searchBugs(queryString, (error, bugs) => {
            const t1 = Date.now();
            debug(`searchAndPlotBugs: ${t1 - t0} ms`);

            if (error) {
                setErrorText(`🤮 ${error.type}`);
                return;
            }

            if (bugs.length === 0) {
                setErrorText("🙈 Zarro boogs found");
                return;
            }

            let changes = {};

            function getChange(date) {
                date = yyyy_mm_dd(date);
                let change = changes[date];
                if (!change) {
                    change = {date: date, bugsOpened: [], bugsClosed: []};
                    changes[date] = change;
                }
                return change;
            }

            const bugList = document.getElementById("bugs");
            let listURL = `https://bugzilla.mozilla.org/buglist.cgi?bug_id=`;

            _.forEach(bugs, bug => {
                if (bug.open) {
                    const bugURL = $bugzilla.makeURL(bug.id);
                    //debug(`Bug ${bug.id} - ${bug.summary}`, bugURL);

                    const bugRow = createElement("div");
                    bugRow.appendChild(createLink(`bug ${bug.id} - ${bug.summary}`, bugURL));
                    bugList.appendChild(bugRow);
                    listURL += `${bug.id},`;
                }

                getChange(bug.reportedAt).bugsOpened.push(bug);

                if (!bug.open) {
                    // XXX pretend last change time is time of resolution
                    getChange(bug.lastModifiedAt).bugsClosed.push(bug);
                }
            });

            const openLink = createLink("Open bug list in Bugzilla", listURL);
            openLink.classList.add('open-bugzilla');
            bugList.appendChild(openLink);

            const bugDates = [];
            const openBugCounts = [];
            const closedBugCounts = [];

            let runningOpenBugCount = 0;
            let runningClosedBugCount = 0;

            changes = _.sortBy(changes, "date");

            _.forEach(changes, change => {
                // How many bugs were closed or opened today?
                const closedBugCountDelta = change.bugsClosed.length;
                const openBugCountDelta = change.bugsOpened.length - closedBugCountDelta;

                runningOpenBugCount += openBugCountDelta;
                runningClosedBugCount += closedBugCountDelta;

                if (change.date >= chartStartDate) {
                    bugDates.push(change.date);
                    openBugCounts.push(runningOpenBugCount);
                    closedBugCounts.push(runningClosedBugCount);
                }
            });

            if (bugDates.length > 0) {
                // Extend earliest bug count to beginning of chart start date.
                if (bugDates[0] > chartStartDate) {
                    bugDates.unshift(chartStartDate);
                    openBugCounts.unshift(_.head(openBugCounts));
                    closedBugCounts.unshift(_.head(closedBugCounts));
                }

                // Extend last bug count to today, so burndown ends on today.
                const today = yyyy_mm_dd(new Date());
                if (_.last(bugDates) < today) {
                    bugDates.push(today);
                    openBugCounts.push(_.last(openBugCounts));
                    closedBugCounts.push(_.last(closedBugCounts));
                }
            }

            drawChart({
                dates: bugDates,
                openBugCounts: openBugCounts,
                closedBugCounts: closedBugCounts,
            });
        });
    }

    searchAndPlotBugs();

    const title = queryString.split("&").join(", ");
    document.title = `Burning up: ${title}`;
})(this);
