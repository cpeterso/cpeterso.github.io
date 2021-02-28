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
      return (searchParams && searchParams.since) ||
             yyyy_mm_dd(new Date(Date.now() - CHART_START_PERIOD));

      function parseQueryString(qs) {
          // e.g. "foo=bar&baz=qux&"
          const kvs = {};
          const params = qs.split("&");
          for (let kv of params) {
              kv = kv.split("=", 2);
              const key = kv[0].toLowerCase();
              if (key.length === 0) {
                  return; // "&&"
              }
              const value = (kv.length > 1) ? decodeURIComponent(kv[1]) : null;
              kvs[key] = value;
          }
          return kvs;
      }
    }

    function getElementValue(id) {
        return document.getElementById(id).value;
    }

    function yyyy_mm_dd(date) {
        return date.toISOString().slice(0,10);
    }

    function drawChart(bugDates, openBugCounts, closedBugCounts) {
        bb.generate({
            data: {
                xs: {
                    "openBugCounts": "bugDates",
                    "closedBugCounts": "bugDates",
                },
                columns: [
                    ["bugDates", ...bugDates],
                    ["closedBugCounts", ...closedBugCounts],
                    ["openBugCounts", ...openBugCounts],
                ],
                names: {
                    "openBugCounts": "Open Bugs",
                    "closedBugCounts": "Closed Bugs",
                },
                types: {
                    "openBugCounts": "area",
                    "closedBugCounts": "area",
                },
                colors: {
                    "openBugCounts": FIREFOX_LIGHT_ORANGE,
                    "closedBugCounts": FIREFOX_LIGHT_BLUE,
                },
                groups: [["openBugCounts", "closedBugCounts"]],
                order: null,
            },
            axis: {
                x: {
                    type: "timeseries",
                    tick: {format: "%Y-%m-%d"},
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
        if (!queryString) {
            setErrorText("🙈 Zarro boogs found");
            return;
        }

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

            let bugActivity = {};

            function openedBugOn(date) {
                let bugDate = bugActivity[date];
                if (bugDate) {
                    bugDate.opened++;
                } else { // is undefined
                    bugActivity[date] = {date: date, opened: 1, closed: 0};
                }
            }

            function closedBugOn(date) {
                let bugDate = bugActivity[date];
                if (bugDate) {
                    bugDate.closed++;
                } else { // is undefined
                    bugActivity[date] = {date: date, opened: 0, closed: 1};
                }
            }

            const bugList = document.getElementById("bugs");
            let bugListURL = `https://bugzilla.mozilla.org/buglist.cgi?bug_id=`;

            for (let bug of bugs) {
                let openDate = yyyy_mm_dd(bug.creationTime);
                if (openDate < chartStartDate) {
                    openDate = chartStartDate;
                }
                openedBugOn(openDate);

                if (bug.open) {
                    const bugURL = $bugzilla.makeURL(bug.id);
                    const bugRow = createElement("div");
                    bugRow.appendChild(createLink(`bug ${bug.id} - ${bug.summary}`, bugURL));
                    bugList.appendChild(bugRow);
                    bugListURL += `${bug.id},`;
                } else {
                    let closedDate = yyyy_mm_dd(bug.resolutionTime);
                    if (closedDate < chartStartDate) {
                        closedDate = chartStartDate;
                    }
                    closedBugOn(closedDate);
                }
            }

            const openLink = createLink("Open bug list in Bugzilla", bugListURL);
            openLink.classList.add('open-bugzilla');
            bugList.appendChild(openLink);

            let bugDates = [];
            let openBugCounts = [];
            let closedBugCounts = [];

            let openBugCount = 0;
            let closedBugCount = 0;

            bugActivity = _.sortBy(bugActivity, "date");
            for (let {date, opened, closed} of bugActivity) {
                bugDates.push(date);

                openBugCount += opened - closed;
                openBugCounts.push(openBugCount);

                closedBugCount += closed;
                closedBugCounts.push(closedBugCount);
            }

            // Extend last bug count to today, so burndown ends on today.
            const today = yyyy_mm_dd(new Date());
            if (bugDates.length > 0 && _.last(bugDates) < today) {
                bugDates.push(today);
                openBugCounts.push(openBugCount);
                closedBugCounts.push(closedBugCount);
            }

            drawChart(bugDates, openBugCounts, closedBugCounts);

            function roundToTwoDecimals(f) {
              return Math.floor(f * 100) / 100;
            }

            let chartPeriodInMs = Date.parse(_.last(bugDates)) - Date.parse(_.first(bugDates));
            let chartPeriodInDays = Math.ceil(chartPeriodInMs / MS_PER_DAY);

            let initialClosedBugCount = _.first(closedBugCounts);
            let currentClosedBugCount = _.last(closedBugCounts);
            let bugsClosed = currentClosedBugCount - initialClosedBugCount;
            let bugsClosedPerDay = (chartPeriodInDays > 0) ? (bugsClosed / chartPeriodInDays) : 0;

            let initialOpenBugCount = _.first(openBugCounts);
            let currentOpenBugCount = _.last(openBugCounts);
            let bugsOpened = currentOpenBugCount - initialOpenBugCount + bugsClosed;
            let bugsOpenedPerDay = (chartPeriodInDays > 0) ? (bugsOpened / chartPeriodInDays) : 0;
            let bugsOpenedAndClosedPerDay = bugsClosedPerDay - bugsOpenedPerDay;

            console.log(`Progress: ${currentClosedBugCount} of ${currentOpenBugCount + currentClosedBugCount} bugs closed = ${roundToTwoDecimals(currentClosedBugCount / (currentOpenBugCount + currentClosedBugCount)) * 100}%`);
            console.log(`Velocity: ${bugsClosed} bugs closed (${initialClosedBugCount} -> ${currentClosedBugCount}) in ${chartPeriodInDays} days = ${roundToTwoDecimals(bugsClosedPerDay)} bugs closed per day`);
            console.log(`Velocity: ${bugsOpened} bugs opened (${initialOpenBugCount} -> ${currentOpenBugCount + bugsClosed}) / ${chartPeriodInDays} days = ${roundToTwoDecimals(bugsOpenedPerDay)} bugs opened per day`);

            function logForecast(desc, bugsClosedPerDay) {
              if (bugsClosedPerDay > 0) {
                let daysToZeroOpenBugs = Math.ceil(currentOpenBugCount / bugsClosedPerDay);
                let msToZeroOpenBugs = daysToZeroOpenBugs * MS_PER_DAY;
                let dateOfZeroOpenBugs = new Date(Date.now() + msToZeroOpenBugs);
                let ymdOfZeroOpenBugs = yyyy_mm_dd(dateOfZeroOpenBugs);
                console.log(`${desc}: ${currentOpenBugCount} open bugs / ${roundToTwoDecimals(bugsClosedPerDay)} bugs closed per day = ${daysToZeroOpenBugs} days -> ${ymdOfZeroOpenBugs}`);
              } else {
                console.log(`${desc}: ${currentOpenBugCount} open bugs / ${roundToTwoDecimals(bugsClosedPerDay)} bugs closed per day -> Infinity`);
              }
            }

            logForecast("Forecast min", bugsClosedPerDay);
            logForecast("Forecast max", bugsOpenedAndClosedPerDay);
        });
    }

    searchAndPlotBugs();

    const title = queryString.split("&").join(", ");
    document.title = `Burning up: ${title}`;
})(this);
