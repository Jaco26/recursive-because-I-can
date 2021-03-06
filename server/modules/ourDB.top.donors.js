const pool = require('./pool');

let result = [];
let nonprofitIds;
let exitCondition;
function getTopDonors (nonprofitIdsPassedIn, res) {
    nonprofitIds = nonprofitIdsPassedIn.split(',').filter(id => Number(id) && id != 1);
    exitCondition = nonprofitIds.length;
    recursive (res)
}

async function recursive (res) {
    // console.log('result.length ************** **** ***   **** * *** ** ** ', result.length);
    if(result.length == exitCondition){
        console.log('RESULT ON BASE CASE FOR ASYNC RECURSIVE', result);
        res.send(result);
        return; 
    }
    let id = nonprofitIds[0];
    await getTopDonorsForGivenNonprofit(id)
    .then(response => {
        result.push(response);
        nonprofitIds.shift();
        recursive(res);
    })
    .catch(err => {
        console.log(err);        
    });   
}

async function getTopDonorsForGivenNonprofit (nonprofitId) {
    let nonprofitName = '';
    let onetimeTopGivers = [];
    let subscriptionTopGivers = [];

    const otdSqlText = `SELECT SUM(otd.amount_charged), users.id as user_id, users.name as username, np.id, np.name as nonprofit_name 
    FROM onetime_donations as otd JOIN users ON otd.user_id = users.id 
    JOIN nonprofit as np ON np.id = otd.nonprofit_id WHERE nonprofit_id = $1
    GROUP BY users.id, np.id
    ORDER BY sum DESC LIMIT 10;`
    await pool.query(otdSqlText, [nonprofitId])
        .then(response => {
            onetimeTopGivers = response.rows;
        })
        .catch(err => {
            console.log(err);  
            res.sendStatus(500);      
        });

    const sidSqlText = `SELECT SUM(sid.amount_paid), users.id as user_id, users.name as username, np.id, np.name as nonprofit_name 
    FROM invoices as sid JOIN users ON sid.user_id = users.id 
    JOIN nonprofit as np ON np.id = sid.nonprofit_id WHERE nonprofit_id = $1 
    GROUP BY users.id, np.id
    ORDER BY sum DESC LIMIT 10;`
    await pool.query(sidSqlText, [nonprofitId])
    .then(response => {
        subscriptionTopGivers = response.rows;
    })
    .catch(err => {
        console.log('ERR in sidSqlText POOL.QUERY >>>>>>>>>>>>', err);
        res.sendStatus(500);
    });
    let topGiversSummary = {
        onetimeTopGivers: onetimeTopGivers,
        subscriptionTopGivers: subscriptionTopGivers,
        grandTotalsByUser: getGrandTotalsByUser(onetimeTopGivers, subscriptionTopGivers),
    };
    if (topGiversSummary.grandTotalsByUser[0]) {
        topGiversSummary.nonprofitName = topGiversSummary.grandTotalsByUser[0].nonprofit_name;
    }
    return topGiversSummary;
}

function getGrandTotalsByUser (onetimeTopGivers, subscriptionTopGivers) {
    let combined = onetimeTopGivers.concat(subscriptionTopGivers);
    let unsortedTotals = combined.reduce( (a, b) => {
        if(a[b.username]){
            a[b.username].sum += Number(b.sum);
            return a;
        } else {
            a[b.username] = {
                sum: Number(b.sum), 
                username: b.username, 
                nonprofit_name: b.nonprofit_name, 
                id: b.id
            };
            return a;
        }
    }, {});
    return packageTotals (unsortedTotals)
}

function packageTotals (totals) {
    let keys = Object.keys(totals);
    let unsortedTotalsArray = keys.map(key => {
        return {
            username: totals[key].username, 
            sum: totals[key].sum, 
            nonprofit_name: totals[key].nonprofit_name, 
            id: totals[key].id
        };
    });
    // return unsortedTotalsArray;
    return sortTotals (unsortedTotalsArray);
}

function sortTotals (unsorted) {
    return unsorted.sort( (a, b) => {
        return b.sum - a.sum
    });
}

module.exports = getTopDonors;




