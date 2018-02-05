#version 410

uniform sampler2D deferred_texture;
uniform sampler2D diffuse_texture;
uniform sampler2D depth_texture;

uniform vec2 inv_res;
uniform float z_near;
uniform float z_far;


in VS_OUT {
	vec2 texcoord;
} fs_in;

layout (location = 0) out vec4 sobel_buffer;


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
            D[i][j] = luminance(deferred_texture, pos);
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
	sobel_buffer =  vec4(sobel(fs_in.texcoord));
}
