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

    const CHART_START_PERIOD = months(3);

    const queryString = parseQueryString();

    function parseQueryString() {
        // e.g. "?foo=bar&baz=qux&/"
        let qs = window.location.search;
        if (qs.length <= 1) {
            return {};
        }

        const slash = (qs[qs.length - 1] === '/') ? -1 : undefined;
        qs = qs.slice(1, slash);

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

    function getElementValue(id) {
        return document.getElementById(id).value;
    }

    function yyyy_mm_dd(date) {
        return date.toISOString().slice(0,10);
    }

    function drawOpenClosed(data) {
        const columns = [
            ["x"].concat(data.dates),
            ["open"].concat(data.open),
            ["closed"].concat(data.closed),
        ];
        if (data.days) {
            columns.push(["days"].concat(data.days));
        }
        document.getElementById('chart').style.opacity = 0;
        setTimeout(() => {
            c3.generate({
                data: {
                    x: "x",
                    columns: columns,
                    names: {
                        open: "Open Bugs",
                        closed: "Closed Bugs",
                    },
                    types: {
                        days: "line",
                        open: "area",
                        closed: "area",
                    },
                    colors: {
                        days: FIREFOX_BLUE,
                        open: "#00C",
                        closed: "#090",
                    },
                    groups: [["open", "closed"]],
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
            document.getElementById('chart').style.opacity = 1;
            document.getElementById('bugs').style.opacity = 1;
        }, 150);

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

    function searchAndPlotBugs(searchTerms) {
        const t0 = Date.now();
        debug("searchAndPlotBugs: " + searchTerms);

        $bugzilla.searchBugs(searchTerms, (error, bugs) => {
            const t1 = Date.now();
            debug("searchAndPlotBugs: " + (t1 - t0) + " ms");
            if (error) {
                console.error("searchBugs: " + error);
                return;
            }

            if (bugs.length === 0) {
                console.info("searchBugs: zarro boogs");
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
            const bugTable = document.getElementById("bugtable");
            let listURL = `https://bugzilla.mozilla.org/buglist.cgi?bug_id=`;

            _.forEach(bugs, bug => {
                if (bug.open) {
                    const bugURL = $bugzilla.makeURL(bug.id);
                    //debug("Bug " + bug.id + " " + bug.summary, bugURL);

                    const bugRow = createElement("tr");
                    const bugCol = createElement("td");
                    bugCol.appendChild(createLink("bug " + bug.id + " - " + bug.summary, bugURL));
                    bugRow.appendChild(bugCol);
                    bugTable.appendChild(bugRow);
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
            bugList.insertBefore(openLink, bugList.firstChild);

            const bugDates = [];
            const openBugCounts = [];
            const closedBugCounts = [];

            let runningOpenBugCount = 0;
            let runningClosedBugCount = 0;

            changes = _.sortBy(changes, "date");

            const chartStartDate = queryString.since ||
                                   yyyy_mm_dd(new Date(Date.now() - CHART_START_PERIOD));

            _.forEach(changes, change => {
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

            drawOpenClosed({
                dates: bugDates,
                open: openBugCounts,
                closed: closedBugCounts,
            });
        });
    }

/*
    function login(username, password) {
        $bugzilla.login(username, password, (error, response) => {
            if (error) {
                console.error("login: " + error);
                alert(error);
                return;
            }
            searchAndPlotBugs(["cf_tracking_e10s", tracking_e10s]);
        });
    }

    const username = document.getElementById("username");
    if (queryString.username) {
        username.value = queryString.username;
    }

    const password = document.getElementById("password");
    if (queryString.password) {
        password.value = queryString.password;
    }

    const button = document.getElementById("button");
    button.focus();
    button.addEventListener("click", () => {
        const username = getElementValue("username");
        const password = getElementValue("password");
        tracking_e10s = getElementValue("bug");
        if (username && password) {
            login(username, password);
        } else {
            searchAndPlotBugs(["cf_tracking_e10s", tracking_e10s]);
        }
    });
// */

    const searchTerms = [];

    const component = queryString.component;
    if (component) {
        const components = component.split(",");
        for (const component of components) {
            searchTerms.push([$bugzilla.field.COMPONENT, component]);
        }
    }

    const whiteboard = queryString.whiteboard;
    if (whiteboard) {
        searchTerms.push([$bugzilla.field.WHITEBOARD, whiteboard]);
    }

    const blocks = queryString.bug || queryString.blocks;
    if (blocks) {
        const blockedBugs = blocks.split(",");
        for (const blockingBug of blockedBugs) {
            searchTerms.push([$bugzilla.field.BLOCKS, blockingBug]);
        }
    }

    searchAndPlotBugs(searchTerms);

    const searchValues = [];
    for (const [key, value] of searchTerms) {
        searchValues.push(value);
    }
    document.title = "Burndown: " + searchValues.join(", ");
})(this);
