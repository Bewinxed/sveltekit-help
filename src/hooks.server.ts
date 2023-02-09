// src/hooks.server.ts
import {
	DISCORD_CLIENT_ID,
	DISCORD_CLIENT_SECRET,
	NEXT_PUBLIC_SECRET,
	TWITTER_CLIENT_ID,
	TWITTER_CLIENT_SECRET,
	AUTH_DB
} from '$env/static/private';
import type { Provider } from '@auth/core/providers';
import Discord from '@auth/core/providers/discord';
import Twitter from '@auth/core/providers/twitter';
import { sequence } from '@sveltejs/kit/hooks';
import { SvelteKitAuth, type SvelteKitAuthConfig } from '@auth/sveltekit';
import { MongoDBAdapter } from '@next-auth/mongodb-adapter';
import type { Handle } from '@sveltejs/kit';
import clientPromise from './lib/mongodb';
import { getServerSession } from 'next-auth';
import { ObjectID } from 'bson';
import type { DiscordUserGuild } from './types/Discord';
export const authOptions: SvelteKitAuthConfig = {
	adapter: MongoDBAdapter(clientPromise, { databaseName: AUTH_DB }),
	secret: NEXT_PUBLIC_SECRET,
	providers: [
		Discord({
			clientId: DISCORD_CLIENT_ID,
			clientSecret: DISCORD_CLIENT_SECRET,
			scope: 'identify email guilds',
			profile: (profile) => {
				console.log('Discord Profile ID:', profile.id);
				return {
					id: profile.id.toString(),
					memberId: profile.id,
					mention: profile.username + '#' + profile.discriminator,
					name: profile.username,
					email: profile.email,
					image: profile.avatar
						? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
						: null
				};
			}
		}) as Provider,
		Twitter({
			clientId: TWITTER_CLIENT_ID,
			clientSecret: TWITTER_CLIENT_SECRET
		}) as Provider
	],
	trustHost: true,
	debug: true,
	callbacks: {
		async signIn({ user, account, profile, email, credentials }) {
			return true;
		},
		async redirect({ url, baseUrl }) {
			return baseUrl;
		},
		async session({ session, token, user }) {
			// console.log('Session User', user);
			// get user from db
			const dbUser = await (
				await clientPromise
			)
				.db(AUTH_DB)
				.collection('accounts')
				.findOne({ userId: new ObjectID(user.id) });
			// if user exists, return user
			if (dbUser) {
				console.log('Found user in db');
				const response = await fetch(`https://discord.com/api/users/@me/guilds`, {
					method: 'GET',
					// basicauth
					credentials: 'include',
					headers: {
						Authorization: `Bearer ${dbUser!.access_token}`,
						'Content-Type': 'application/json',
						Accept: 'application/json'
					}
				});
				const guilds: DiscordUserGuild = await response.json();
				session.user.guilds = guilds;
				// add guilds to session
			}
			session.user.id = user.memberId;

			return session;
		},
		async jwt({ token, account, profile }) {
			if (account) {
				token.accessToken = account.access_token;
				token.id = profile.id;
				console.log('jwt token', JSON.stringify(token));
			}
			return token;
		}
	},
	events: {
		async signIn(message) {
			/* on sign in */
			console.log('Successfully signed in', message.user.name);
		}
		// async signOut(message) {
		// 	/* on signout */
		// },
		// async createUser(message) {
		// 	/* user created */
		// },
		// async updateUser(message) {
		// 	/* user updated - e.g. their email was verified */
		// },
		// async linkAccount(message) {
		// 	/* account (e.g. Twitter) linked to a user */
		// },
		// async session(message) {
		// 	/* session is active */
		// }
	}
};
// const handleSession: Handle = async ({ event, resolve }) => {
// 	const session = await getServerSession(event.request, authOptions);
// 	// @ts-expect-error - apply NextAuth.js session directly to session locals
// 	event.locals.session = session;
// 	return resolve(event);
// };

export const handle: Handle = sequence(SvelteKitAuth(authOptions));
