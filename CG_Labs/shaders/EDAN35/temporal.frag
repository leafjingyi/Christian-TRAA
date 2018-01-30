#version 410

#define DEPTH_EPSILON 0.00001

uniform sampler2D history_texture;
uniform sampler2D current_texture;

uniform sampler2D depth_texture;
uniform sampler2D velocity_texture;
uniform sampler2D diffuse_texture;

uniform vec2 inv_res;
uniform mat4 jitter;
uniform float k_feedback_max;
uniform float k_feedback_min;
uniform float z_near;
uniform float z_far;

//#define HISTORY_CLAMPING // Use Clamping rather than clipping
#define HISTORY_COLOR_AVERAGE // Average for the color of the center of the bounding box that clips history
//#define USE_SOBEL
//#define RENDER_SOBEL // Render Edge Detection

#if defined(RENDER_SOBEL) && !defined(USE_SOBEL)
#define USE_SOBEL
#endif // define(RENDER_SOBEL) && !define(USE_SOBEL)

//#define NO_TRAA // No TRAA
#define ORIGINAL_TRAA // Use inside TRAA
//#define MODIFIED_TRAA // Use Modified TRAA

#ifdef NO_TRAA
	#define BOX_3X3
	#undef ORIGINAL_TRAA
	#undef MODIFIED_TRAA
#endif // NO_TRAA

#ifdef MODIFIED_TRAA
	#define BOX_4X4
	#define USE_SOBEL
	#undef ORIGINAL_TRAA
	#undef NO_TRAA
#endif // MODIFIED_TRAA

#ifdef ORIGINAL_TRAA
	#define BOX_3X3
	#undef MODIFIED_TRAA
	#undef NO_TRAA
#endif // ORIGINAL_TRAA

//#define BOX_5X5

#ifdef BOX_3X3

#undef BOX_4X4
#undef BOX_5X5 

#define BOX_RANGE (1.0)
#define BOX_AMOUNT (9.0)

#endif // BOX_3X3

#ifdef BOX_4X4

#undef BOX_3X3
#undef BOX_5X5 

#define BOX_RANGE (1.5)
#define BOX_AMOUNT (16.0)

#endif // BOX_4X4

#ifdef BOX_5X5

#undef BOX_3X3
#undef BOX_4X4 

#define BOX_RANGE (2)
#define BOX_AMOUNT (25.0)

#endif // BOX_5X5


// Sobel Edge Filtering
#define ORIGINAL_SOBEL
//#define MODIFIED_SOBEL

#ifdef ORIGINAL_SOBEL
#undef MODIFIED_SOBEL
uniform mat3 sx = mat3( 
    1.0, 2.0, 1.0, 
    0.0, 0.0, 0.0, 
   -1.0, -2.0, -1.0 
);
uniform mat3 sy = mat3( 
    1.0, 0.0, -1.0, 
    2.0, 0.0, -2.0, 
    1.0, 0.0, -1.0 
);

#endif // ORIGINAL_SOBEL

#ifdef MODIFIED_SOBEL
#undef ORIGINAL_SOBEL
uniform mat3 sx = mat3( 
    3.0, 10.0, 3.0, 
    0.0, 0.0, 0.0, 
   -3.0, -10.0, -3.0 
);
uniform mat3 sy = mat3( 
    3.0, 0.0, -3.0, 
    10.0, 0.0, -10.0, 
    3.0, 0.0, -3.0 
);

#endif // MODIFIED_SOBEL

in VS_OUT {
	vec2 texcoord;
} fs_in;

layout (location = 0) out vec4 current_history_texture;
layout (location = 1) out vec4 temporal_output;

// TODO: Understand this
// Taken from http://www.gdcvault.com/play/1022970/Temporal-Reprojection-Anti-Aliasing-in
// note: clips towards aabb center + p.w
vec4 clip_aabb( vec3 aabb_min, // cn_min
	vec3 aabb_max, // cn_max
	vec4 p, // c_in’
	vec4 q) // c_hist
{
	vec3 p_clip = 0.5 * (aabb_max + aabb_min);
	vec3 e_clip = 0.5 * (aabb_max - aabb_min);
	vec4 v_clip = q - vec4(p_clip, p.w);
	vec3 v_unit = v_clip.xyz / e_clip;
	vec3 a_unit = abs(v_unit);
	//float ma_unit = max(a_unit.x, max(a_unit.y, a_unit.z));
	float ma_unit = length(v_clip.xyz) / length(e_clip.xyz);
	if (ma_unit > 1.0)
		return vec4(p_clip, p.w) + v_clip / ma_unit;
	else
		return q;// point inside aabb
}

float luminance(vec4 color_in) {
	return 0.25 * color_in.r + 0.5 * color_in.g + 0.25 * color_in.b;
}

float luminance(sampler2D texture_in, vec2 uv, float bias) {
	vec4 sample_color = texture(texture_in, uv, bias);
	return luminance(sample_color);
}

float luminance(sampler2D texture_in, vec2 uv) {
	return luminance(texture_in, uv, 0.0);
}

// From http://glampert.com/2014/01-26/visualizing-the-depth-buffer/
float linear_depth(vec2 uv) {
	float depth = texture2D(depth_texture, uv, 0).x;
    return (2.0 * z_near) / (z_far + z_near - depth * (z_far - z_near));
}

// Sobel
// Based on https://computergraphics.stackexchange.com/questions/3646/opengl-glsl-sobel-edge-detection-filter
float sobel(vec2 uv) {
    mat3 I;
    mat3 D;
    mat3 J;
    for (int i=0; i<3; i++) {
        for (int j=0; j<3; j++) {
        	vec2 pos = vec2(uv) + vec2((i-1) * inv_res.x, (j-1) * inv_res.y);
            I[i][j] = luminance(diffuse_texture, pos);
            D[i][j] = luminance(current_texture, pos);
            J[i][j] = sqrt(linear_depth(pos));
	    }
	}

	float gx = dot(sx[0], I[0]) + dot(sx[1], I[1]) + dot(sx[2], I[2]); 
	float gy = dot(sy[0], I[0]) + dot(sy[1], I[1]) + dot(sy[2], I[2]);

	float g = sqrt(pow(gx, 2.0)+pow(gy, 2.0));

	float fx = dot(sx[0], D[0]) + dot(sx[1], D[1]) + dot(sx[2], D[2]); 
	float fy = dot(sy[0], D[0]) + dot(sy[1], D[1]) + dot(sy[2], D[2]);

	float f = sqrt(pow(fx, 2.0)+pow(fy, 2.0));

	float hx = dot(sx[0], J[0]) + dot(sx[1], J[1]) + dot(sx[2], J[2]); 
	float hy = dot(sy[0], J[0]) + dot(sy[1], J[1]) + dot(sy[2], J[2]);

	float h = sqrt(pow(hx, 2.0)+pow(hy, 2.0));

	h = sqrt(h);

	
	g = (mix(g, f, 0.5) + h);
	g = clamp(g, 0.0, 1.0);
	g = smoothstep(0.0, 1.0, g);
	return g;
}

void main()
{
	vec4 j_uv; // Jitter Pos
	j_uv = vec4(fs_in.texcoord, 0.0, 0.0);
	j_uv = jitter * (2.0 * j_uv - vec4(1.0, 1.0, 0.0, -1.0));
	j_uv = j_uv * 0.5 + vec4(0.5);
	vec2 p_uv;
	vec4 p = vec4(1.0, 1.0, 1.0, 0.0); // everything at the back of fustrum
	float depth;
	float closest_depth;
	float depth_step;
	// Color constraints
	vec4 cn_max = vec4(0.0, 0.0, 0.0, 0.0);
	vec4 cn_min = vec4(1.0, 1.0, 1.0, 0.0);
	vec4 cn_temp;
	vec4 cn_avg = vec4(0.0);

	// Neighbours box
	for(float y=-BOX_RANGE; y<=BOX_RANGE; y+=1.0) {
		for(float x=-BOX_RANGE; x<=BOX_RANGE; x+=1.0) {
			p_uv = j_uv.xy + vec2(x * inv_res.x, y * inv_res.y);
			depth = texture(depth_texture, p_uv).x;

			depth_step = step(p.z, depth + DEPTH_EPSILON);
			p.xyz = depth_step * p.xyz +  (1.0 - depth_step) * vec3(p_uv.x, p_uv.y, depth); // Compare using depth

			// Color Constraint
			cn_temp = texture(current_texture, p_uv);
			cn_min = min(cn_min, cn_temp);
			cn_max = max(cn_max, cn_temp);
			cn_avg += cn_temp;
		}
	}
	cn_avg = cn_avg / BOX_AMOUNT;

	p_uv = p.xy;
	closest_depth = p.z;

	// Velocity history
	vec2 v = texture(velocity_texture, p_uv).rg;
	vec2 q_uv = (2.0 * fs_in.texcoord - vec2(1.0)) - v;
	q_uv = 0.5 * q_uv + vec2(0.5);

	vec4 c_hist = texture(history_texture, q_uv);

	// Color Constraint Cross
	vec4 cn_cross_max = vec4(0.0, 0.0, 0.0, 0.0);
	vec4 cn_cross_min = vec4(1.0, 1.0, 1.0, 0.0);
	vec4 cn_cross_avg = vec4(0.0);

	vec2 cross_temp;

	cross_temp = j_uv.xy + vec2((-1.0) * inv_res.x, 0.0);
	cn_temp = texture(current_texture, cross_temp);
	cn_cross_min = min(cn_cross_min, cn_temp);
	cn_cross_max = max(cn_cross_max, cn_temp);
	cn_cross_avg += cn_temp;

	cross_temp = j_uv.xy + vec2(0.0, (1.0) * inv_res.y);
	cn_temp = texture(current_texture, cross_temp);
	cn_cross_min = min(cn_cross_min, cn_temp);
	cn_cross_max = max(cn_cross_max, cn_temp);
	cn_cross_avg += cn_temp;

	cn_temp = texture(current_texture, j_uv.xy);
	cn_cross_min = min(cn_cross_min, cn_temp);
	cn_cross_max = max(cn_cross_max, cn_temp);
	cn_cross_avg += cn_temp;

	cross_temp = j_uv.xy + vec2(0.0, (-1.0) * inv_res.y);
	cn_temp = texture(current_texture, cross_temp);
	cn_cross_min = min(cn_cross_min, cn_temp);
	cn_cross_max = max(cn_cross_max, cn_temp);
	cn_cross_avg += cn_temp;

	cross_temp = j_uv.xy + vec2((1.0) * inv_res.x, 0.0);
	cn_temp = texture(current_texture, cross_temp);
	cn_cross_min = min(cn_cross_min, cn_temp);
	cn_cross_max = max(cn_cross_max, cn_temp);
	cn_cross_avg += cn_temp;

	// Mix min-max averaging

	cn_min = mix(cn_min, cn_cross_min, 0.5);
	cn_max = mix(cn_max, cn_cross_max, 0.5);
	cn_avg = mix(cn_avg, cn_cross_avg, 0.5);


	vec4 c_in = texture(current_texture, j_uv.xy);

#ifdef HISTORY_CLAMPING
	vec4 c_hist_constrained = clamp(c_hist, cn_min, cn_max);
#elif defined(HISTORY_COLOR_AVERAGE)
	vec4 c_hist_constrained = clip_aabb(cn_min.rgb, cn_max.rgb, clamp(cn_avg, cn_min, cn_max), c_hist);
#else
	vec4 c_hist_constrained = clip_aabb(cn_min.rgb, cn_max.rgb, c_in, c_hist);
#endif // HISTORY_COLOR_AVERAGE

	// Feedback Luminance Weighting
	float lum_current = luminance(c_in);
	float lum_history = luminance(c_hist_constrained);

	float unbiased_diff = abs(lum_current - lum_history) / max(lum_current, max(lum_history, 0.2));
	float unbiased_weight = 1.0 - unbiased_diff;
	float unbiased_weight_sqr = unbiased_weight * unbiased_weight;
	float k_feedback = mix(k_feedback_min, k_feedback_max, unbiased_weight_sqr);
#ifdef USE_SOBEL
	// Sobel
	float g = sobel(j_uv.xy);
#endif // USE_SOBEL

#ifdef RENDER_SOBEL
	current_history_texture = vec4(vec3(g), 1.0); // Border Detection
#else

	#ifdef NO_TRAA
	current_history_texture = texture(current_texture, fs_in.texcoord); // No TRAA
	#elif defined(ORIGINAL_TRAA)
	current_history_texture = mix(c_in, c_hist_constrained, k_feedback); // Inside TRAA
	#elif defined(MODIFIED_TRAA)
	current_history_texture = mix(c_in, c_hist_constrained, k_feedback * max(g, 0.9)); // Modified TRAA
	#else
	#error No mode selected
	#endif // NO_TRAA
	
#endif // RENDER_SOBEL

	temporal_output.xyzw = current_history_texture.xyzw;
}