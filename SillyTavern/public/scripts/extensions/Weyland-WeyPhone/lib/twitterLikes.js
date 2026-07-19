// lib/twitterLikes.js

/**
 * Toggles the user's own like on one cached feed/profile post — pure visual flair, nothing is
 * sent anywhere. The change persists into the cached content (via setPhoneAppContent at the call
 * site) so it survives re-renders, and is naturally overwritten by the next sync.
 *
 * Immutable: returns a new content object; the input is never mutated. Out-of-range indices
 * return the input unchanged.
 * @param {{posts: Array<{likes: number, liked?: boolean}>}} content cached app content
 * @param {number} postIndex
 * @returns {{posts: Array}} new content
 */
export function toggleLike(content, postIndex) {
    const posts = content?.posts;
    if (!Array.isArray(posts) || postIndex < 0 || postIndex >= posts.length) return content;
    const newPosts = posts.map((post, i) => {
        if (i !== postIndex) return post;
        const liked = !post.liked;
        return { ...post, liked, likes: Math.max(0, (post.likes ?? 0) + (liked ? 1 : -1)) };
    });
    return { ...content, posts: newPosts };
}
