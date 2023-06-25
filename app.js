const express = require("express");
const { open } = require("sqlite");
const app = express();

const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const jwt = require("jsonwebtoken");

app.use(express.json());
const bcrypt = require("bcrypt");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

//API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const checkUserQuery = `SELECT * FROM user WHERE username= '${username}';`;
  const userData = await db.get(checkUserQuery);
  console.log(userData);

  if (userData === undefined) {
    const postNewUserQuery = `INSERT INTO user(username,password,name,gender)
                                    VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const newUserDetails = await db.run(postNewUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);

  const getFollowerIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id =${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowerIdsQuery);

  const getFollowerIdsSimple = getFollowerIds.map((each) => {
    return each.following_user_id;
  });

  const getTweetQuery = `SELECT user.username, tweet.tweet,tweet.date_time AS dateTime
                            FROM user INNER JOIN tweet 
                            ON user.user_id=tweet.user_id WHERE user.user_id IN (${getFollowerIdsSimple})
                            ORDER BY tweet.date_time DESC 
                            LIMIT 4;`;
  const responseResult = await db.all(getTweetQuery);
  response.send(responseResult);
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);

  const getFollowerIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id =${getUserId.user_id};`;
  const getFollowerIdsArray = await db.all(getFollowerIdsQuery);

  const getFollowerIds = getFollowerIdsArray.map((each) => {
    return each.following_user_id;
  });

  const getFollowersResultQuery = `SELECT name FROM user WHERE user_id IN (${getFollowerIds});`;
  const responseResult = await db.all(getFollowersResultQuery);
  response.send(responseResult);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);

  const getFollowerIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id =${getUserId.user_id};`;
  const getFollowerIdsArray = await db.all(getFollowerIdsQuery);
  console.log(getFollowerIdsArray);

  const getFollowerIds = getFollowerIdsArray.map((each) => {
    return each.following_user_id;
  });
  console.log(`${getFollowerIds}`);
  const getFollowersNameQuery = `SELECT name FROM user WHERE user_id IN (${getFollowerIds})`;
  const getFollowersName = await db.all(getFollowersNameQuery);
  response.send(getFollowersName);
});

//API 6
const apiOutput = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.dateTime,
  };
};
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;

  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);

  const getFollowingIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id =${getUserId.user_id};`;
  const getFollowingIdsArray = await db.all(getFollowingIdsQuery);
  const getFollowingIds = getFollowingIdsArray.map((each) => {
    return each.following_user_id;
  });

  const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingIds})`;
  const getTweetIdsArray = await db.all(getTweetIdsQuery);
  const followingTweetIds = getTweetIdsArray.map((each) => {
    return each.tweet_id;
  });
  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likesCountQuery = `SELECT count(user_id) AS likes FROM like WHERE tweet_id= ${tweetId};`;
    const likesCount = await db.get(likesCountQuery);

    const replyCountQuery = `select count(user_id) as replies from reply where tweet_id= ${tweetId};`;
    const replyCount = await db.get(replyCountQuery);

    const tweetDateQuery = `select tweet, date_time from tweet where tweet_id=${tweetId};`;
    const tweetDate = await db.get(tweetDateQuery);

    response.send(apiOutput(tweetDate, likesCount, replyCount));
  } else {
    response.status(400);
    response.send("Invalid Request");
    console.log("Invalid Request");
  }
});

//API 7

const convertLikedUserName = (dbObject) => {
  return {
    likes: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);

    const getFollowingIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id =${getUserId.user_id};`;
    const getFollowingIdsArray = await db.all(getFollowingIdsQuery);
    const getFollowingIds = getFollowingIdsArray.map((each) => {
      return each.following_user_id;
    });

    const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingIds})`;
    const getTweetIdsArray = await db.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((each) => {
      return each.tweet_id;
    });
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getLikedUsersNameQuery = `select user.username as likes from user inner join like on user.user_id=like.user_id where like.tweet_id=${tweetId};`;
      const getLikedUserNamesArray = await db.all(getLikedUsersNameQuery);

      const getLikedUserNames = getLikedUserNamesArray.map((each) => {
        return eachUser.likes;
      });
      response.send(convertLikedUserName(getLikedUserNames));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8
const convertUserNameReplied = (dbObject) => {
  return {
    replies: dbObject,
  };

  app.get(
    "/tweets/:tweetId/replies/",
    authenticateToken,
    async (request, response) => {
      const { tweetId } = request.params;
      console.log(tweetId);
      let { username } = request;
      const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
      const getUserId = await db.get(getUserIdQuery);

      const getFollowingIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id =${getUserId.user_id};`;
      const getFollowingIdsArray = await db.all(getFollowingIdsQuery);
      const getFollowingIds = getFollowingIdsArray.map((each) => {
        return each.following_user_id;
      });
      console.log(getFollowingIds);

      const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingIds})`;
      const getTweetIdsArray = await db.all(getTweetIdsQuery);
      const getTweetIds = getTweetIdsArray.map((each) => {
        return each.tweet_id;
      });
      console.log(getTweetIds);
      if (getTweetIds.includes(parseInt(tweetId))) {
        const getUserNameReplyTweetsQuery = `select user.name, reply.reply from user inner join reply on user.user_id=reply.user_id where reply.tweet_id=${tweetId};`;
        const getUserNameReplyTweets = await db.all(
          getUserNameReplyTweetsQuery
        );
        response.send(convertUserNameReplied(getUserNameReplyTweets));
      } else {
        response.status(400);
        response.send("Invalid Request");
      }
    }
  );
};

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  console.log(getUserId);

  const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingIds})`;
  const getTweetIdsArray = await db.all(getTweetIdsQuery);
  const getTweetIds = getTweetIdsArray.map((each) => {
    return parseInt(each.tweet_id);
  });
  console.log(getTweetIds);
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);

  const { tweet } = request.body;
  const currentDate = new Date();
  console.log(currentDate.toISOString().replace("T", " "));

  const postRequestQuery = `insert into tweet(tweet,user_id,date_time) values("${tweet}",${getUserId.user_id},'${currentDate};')`;
  const responseResult = await db.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);

    const getUserTweetsListQuery = `SELECT tweet_id FROM tweet WHERE user_id=${getUserId.user_id};`;
    const getUserTweetsListArray = await db.all(getUserTweetsListQuery);
    const getUserTweetsList = getUserTweetsListArray.map((each) => {
      return each.tweet_id;
    });
    console.log(getUserTweetsList);
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
