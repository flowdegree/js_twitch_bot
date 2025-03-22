import firebaseConfig from "./config";
import cronstrue from "cronstrue";
import admin from "firebase-admin";
import TwitchJs from "twitch-js";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

const timezone = { timezone: "Asia/Riyadh" };

const onAuthenticationFailure = async () =>{
	console.log("onAuthenticationFailure");
	const params = new URLSearchParams();
	params.append("grant_type", "client_credentials");
	params.append("client_id", process.env.TWITCH_CLIENT_ID!);
	params.append("client_secret", process.env.TWITCH_CLIENT_SECRET!);
	const url = `https://id.twitch.tv/oauth2/token?${params.toString()}`;
	console.log(url);

	const response = await fetch(url, {method: "POST"});
	const data = await response.json();
	return data.access_token;
}

const twitch_options = {
	username: "bufai7an",
	token: process.env.TWITCH_CLIENT_SECRET,
	clientId: process.env.TWITCH_CLIENT_ID,
	onAuthenticationFailure: onAuthenticationFailure,
};
const twitchJs = new TwitchJs(twitch_options,);
const interval = '0 */5 * * * *';


admin.initializeApp({
	credential: admin.credential.cert(firebaseConfig),
});

const firestore = admin.firestore();
const collection_name = "twitch";

console.log(`running twitch bot every ${cronstrue.toString(interval)}`)


async function run() {
	const bots_collection: any = await downloadCollection(collection_name);
	if (!bots_collection) {
		console.error("Failed to download collection");
		return;
	}
	const bufai7an_object = bots_collection.bufai7an;
	console.log(`checking if any of those are live: ${bufai7an_object.monitor.friends}`);

    // check friends first
	for (const friend of bufai7an_object.monitor.friends) {
		console.log(`checking if ${friend} is live`);
		try {
			const friends_stream = await twitchJs.api.get("streams", {
				search: {
					user_login: friend,
				},
			});

			if (friends_stream.data.length > 0) {
				try {
					const user_info = await twitchJs.api.get("users", {
						search: { login: friend },
					});
					// check if exists in streaming_now property
					// if yes, do nothing
					if (bufai7an_object.streaming_now.includes(friend)) {
					}
					// if no,
					else {
						console.log("updating streaming_now");
						// add to the property
						updateStreamingNowArray([
							...bufai7an_object.streaming_now,
							friend,
						]);

						// notify discord
						const title = `${friends_stream.data[0].title}`;
						const body = `Hey @everyone, ${friend} is live now on Twitch (${friends_stream.data[0].gameName}) check it out, https://twitch.tv/${friend}`;
						const embeds = [
							{
								title: `${friends_stream.data[0].title}`,
								url: `https://twitch.tv/${friend}`,
								color: 1127128,
								author: {
									name: user_info.data[0].displayName,
									url: `https://twitch.tv/${friend}`,
									icon_url: user_info.data[0].profileImageUrl
								},
								thumbnail: {
									url: user_info.data[0].profileImageUrl,
								},
								image: {
									url: friends_stream.data[0].thumbnailUrl
										.replace("{width}", "720")
										.replace("{height}", "405"),
								},
								fields: [
									{
										name: "Viewers",
										value: friends_stream.data[0].viewerCount,
										inline: false,
									},
								],
							},
						];

						notifyDiscord(title, body, embeds);
					}
				} catch (error) {
					console.error(`Error fetching user info for ${friend}:`, error);
				}
			} 
			else {
				// check if exists in streaming_now property
				// if yes, remove him
				if (bufai7an_object.streaming_now.includes(friend)) {
					const new_friends_list = bufai7an_object.streaming_now.filter(
						(user: any) => user !== friend
					);
					updateStreamingNowArray(new_friends_list);
				}
			}

			console.log(
				friends_stream.data.length > 0
					? `✅ ${friend} is live`
					: `❌ ${friend} is not live`
			);
		} catch (error) {
			console.error(`Error checking if ${friend} is live:`, error);
			// If user doesn't exist, remove from streaming_now if present
			if (bufai7an_object.streaming_now.includes(friend)) {
				const new_friends_list = bufai7an_object.streaming_now.filter(
					(user: any) => user !== friend
				);
				updateStreamingNowArray(new_friends_list);
			}
		}
	}

    // check categories
    const categoryIdsArray = bufai7an_object.monitor.categories.map((category: any) => category.id);

    let search_options: any = {
        search: {
            game_id: categoryIdsArray,
            type: 'live',
            first: 100
        }
    };
    let result = await twitchJs.api.get('streams', search_options);
    let category_streams = result.data;
    if (category_streams.length > 100){
        search_options.search.after = category_streams.pagination.cursor;
        result = await twitchJs.api.get('streams', search_options);
        category_streams = category_streams.concat(result.data);

    }

    const streamerUsernames = category_streams.map((stream: any) => stream.user_login);


    console.log(category_streams.length);
    const search_tags = ['arab', 'arabic'];

    for(const stream of category_streams){
        const lowercaseTags = stream.tags.map((tag: any) => tag.toLowerCase());

        if (search_tags.some(tag => lowercaseTags.includes(tag.toLowerCase()))) {
            console.log('Found a matching tag');
            // if not exists in streaming now, add it
            const friend = stream.user_login;
            try {
                const user_info = await twitchJs.api.get("users", {
                    search: { login: friend },
                });

                if(bufai7an_object.streaming_now.includes(friend)){

                }
                else{
                    console.log("updating streaming_now");
                    // add to the property
                    updateStreamingNowArray([
                        ...bufai7an_object.streaming_now,
                        friend,
                    ]);

                    // notify discord
                    const title = `${stream.title}`;
                    const body = `Hey @everyone, ${friend} is live now on Twitch (${stream.gameName}) check it out, https://twitch.tv/${friend}`;
                    const embeds = [
                        {
                            title: `${stream.title}`,
                            url: `https://twitch.tv/${friend}`,
                            color: 1127128,
                            author: {
                                name: user_info.data[0].displayName,
                                url: `https://twitch.tv/${friend}`,
                                icon_url: user_info.data[0].profileImageUrl
                            },
                            thumbnail: {
                                url: user_info.data[0].profileImageUrl,
                            },
                            image: {
                                url: stream.thumbnailUrl
                                    .replace("{width}", "720")
                                    .replace("{height}", "405"),
                            },
                            fields: [
                                {
                                    name: "Viewers",
                                    value: stream.viewerCount,
                                    inline: false,
                                },
                            ],
                        },
                    ];

                    notifyDiscord(title, body, embeds);
                }
            } catch (error) {
                console.error(`Error fetching user info for ${friend}:`, error);
            }
        }
        else{
            console.log(`no stream matching the tags ${search_tags}`);
        }
    }

    // now remove the ones not appearing in friends or live streams
    for(const streamer of bufai7an_object.streaming_now){
        // if is not a friend, and not in the recent streams search, remove him
        if(!bufai7an_object.monitor.friends.includes(streamer) && !streamerUsernames.includes(streamer)){
            const new_friends_list = bufai7an_object.streaming_now.filter(
                (user: any) => user !== streamer
            );
            updateStreamingNowArray(new_friends_list);
        }
    }

    return;

}

async function notifyDiscord(title: any, message: any, embeds: any) {
	const http = require("https");
	const postData = JSON.stringify({
		title: title,
		content: message,
		embeds: embeds,
	});

	const webhookUrl =
		"https://discord.com/api/webhooks/1112121103737966594/bcFlehIaaRdoxuU1ohqys5RQ31ncpRQfitWVuQtU5UDdR4qkw9bspJLZZWHaBMZJkNeF";

	const requestOptions = {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Content-Length": Buffer.byteLength(postData),
		},
	};

	const req = http.request(webhookUrl, requestOptions, (res: any) => {
		console.log(`Message sent. Status code: ${res.statusCode}`);
	});

	req.on("error", (error: any) => {
		console.error("Error sending message:", error);
	});

	req.write(postData);
	req.end();
}

async function updateStreamingNowArray(object: any) {
    await firestore
		.collection(collection_name)
		.doc("bufai7an")
		.update({ streaming_now: object });
}

async function downloadCollection(collectionName: any) {
	try {
		const collectionRef = firestore.collection(collectionName);
		const snapshot = await collectionRef.get();
		const collection: any = {};
		snapshot.forEach((doc) => {
			collection[doc.id] = doc.data();
		});
		return collection;
	} catch (error) {
		console.error(
			`Error downloading collection "${collectionName}":`,
			error
		);
		return null;
	}
}

cron.schedule(interval, async () => {
	await run();
});

(async () => {
    await run();
})();
