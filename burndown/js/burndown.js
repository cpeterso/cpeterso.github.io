;((exports) => {
    "use strict";

    // https://mozilla.design/firefox/color/
    const FIREFOX_YELLOW_6 = "#FFA537";
    const FIREFOX_BLUE_4 = "#00B3F5";

    const MS_PER_DAY = 24*60*60*1000;
    const MS_PER_WEEK = 7*MS_PER_DAY;
    const MS_PER_MONTH = 4*MS_PER_WEEK;

    function getForecastedNightlyVersion(forecastDate) {
        const NIGHTLY_FREEZE_DATES = [
            makeFreezeDate(88, "2021-03-18"),
            makeFreezeDate(89, "2021-04-15"),
            makeFreezeDate(90, "2021-05-13"),
            makeFreezeDate(91, "2021-06-10"),
            makeFreezeDate(92, "2021-07-08"),
            makeFreezeDate(93, "2021-08-05"),
            makeFreezeDate(94, "2021-09-02"),
            makeFreezeDate(95, "2021-09-30"),
            makeFreezeDate(96, "2021-10-28"),
            makeFreezeDate(97, "2021-12-02"),
            makeFreezeDate(98, "2022-01-06"),
        ];

        let forecastTime = forecastDate.getTime();
        for (const nightly of NIGHTLY_FREEZE_DATES) {
            if (forecastTime <= nightly.freezeTime) {
                return nightly.version;
            }
        }

        return "2022? 😵";

      function makeFreezeDate(nightlyVersion, freezeYMD) {
          return {version: nightlyVersion, freezeTime: new Date(freezeYMD).getTime()};
      }
    }

    const DEBUG = true;
    function debug(...args) { DEBUG && console.debug(...args); }

    function days(d) { return d * MS_PER_DAY; }
    function weeks(w) { return days(7 * w); }
    function months(m) { return weeks(4 * m); }

    const queryString = getQueryString();
    const searchParams = parseQueryString(queryString);
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

    function parseQueryString(qs) {
        // e.g. "foo=bar&baz=qux&"
        const kvs = {};
        const params = qs.split("&");
        for (let kv of params) {
            kv = kv.split("=", 2);
            const key = kv[0].toLowerCase();
            if (key.length === 0) {
                continue; // "&&"
            }
            const value = (kv.length > 1) ? decodeURIComponent(kv[1]) : "";
            kvs[key] = value;
        }
        return kvs;
    }

    function getChartStartDate() {
      const CHART_START_PERIOD = months(3);
      return (searchParams.burnup_since || searchParams.since) ||
             yyyy_mm_dd(new Date(Date.now() - CHART_START_PERIOD));
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
                    "openBugCounts": FIREFOX_YELLOW_6,
                    "closedBugCounts": FIREFOX_BLUE_4,
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

    function searchAndPlotBugs(bugzillaQuery) {
        const t0 = Date.now();
        debug(`searchAndPlotBugs: ${bugzillaQuery}`);
        if (!bugzillaQuery) {
            setErrorText("🙈 Zarro boogs found");
            return;
        }

        $bugzilla.searchBugs(bugzillaQuery, (error, bugs) => {
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

                // Don't display bugs closed before the start date.
                if (closedBugCounts.length == 0 &&
                    searchParams.burnup_ignore_old_closed_bugs !== undefined) {
                  closedBugCounts.push(closedBugCount);
                } else {
                  closedBugCount += closed;
                  closedBugCounts.push(closedBugCount);
                }
            }

            // Extend last bug count to today, so burndown ends on today.
            const today = yyyy_mm_dd(new Date());
            if (bugDates.length > 0 && _.last(bugDates) < today) {
                bugDates.push(today);
                openBugCounts.push(openBugCount);
                closedBugCounts.push(closedBugCount);
            }

            drawChart(bugDates, openBugCounts, closedBugCounts);

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

            let newBugCount = currentOpenBugCount + currentClosedBugCount - initialOpenBugCount;
            console.log(`Scope creep: ${initialOpenBugCount} open bugs -> ${currentOpenBugCount + bugsClosed} open + closed bugs = ${100 * roundToTwoDecimals((currentOpenBugCount + bugsClosed) / initialOpenBugCount)}%`);

            //logForecast("Old forecast min", bugsClosedPerDay);
            //logForecast("Old forecast max", bugsOpenedAndClosedPerDay);

            logForecast("FISSION FORECAST: Optimistic", 2);
            logForecast("FISSION FORECAST: Pessimistic", 1);

            function roundToTwoDecimals(f) {
              return Math.floor(f * 100) / 100;
            }

            function logForecast(desc, bugsClosedPerDay) {
              if (bugsClosedPerDay > 0) {
                let daysToZeroOpenBugs = Math.ceil(currentOpenBugCount / bugsClosedPerDay);
                let msToZeroOpenBugs = daysToZeroOpenBugs * MS_PER_DAY;
                let dateOfZeroOpenBugs = new Date(Date.now() + msToZeroOpenBugs);
                let ymdOfZeroOpenBugs = yyyy_mm_dd(dateOfZeroOpenBugs);
                console.log(`${desc}: ${currentOpenBugCount} open bugs / ${roundToTwoDecimals(bugsClosedPerDay)} bugs closed per day = ${daysToZeroOpenBugs} days -> ${ymdOfZeroOpenBugs} (Nightly ${getForecastedNightlyVersion(dateOfZeroOpenBugs)})`);
              } else {
                console.log(`${desc}: ${currentOpenBugCount} open bugs / ${roundToTwoDecimals(bugsClosedPerDay)} bugs closed per day -> Infinity`);
              }
            }
        });
    }

    const PRODUCT_FILTER = "&classification=Client%20Software&classification=Components&product=DevTools&product=Firefox&product=Core&product=Testing&product=Toolkit&product=WebExtensions";
    let bugzillaQuery = queryString + PRODUCT_FILTER;
    searchAndPlotBugs(bugzillaQuery);

    const title = queryString.split("&").join(", ");
    document.title = `Burning up: ${title}`;
})(this);
