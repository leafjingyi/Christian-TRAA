#pragma once

#include "TRSTransform.h"
#include "InputHandler.h"

#include <glm/glm.hpp>

#include <iostream>

#define CAMERA_JITTERING_SIZE 128
#define TEMPORAL_JITTERING 16

template<typename T, glm::precision P>
class FPSCamera
{
public:
	FPSCamera(T fovy, T aspect, T nnear, T nfar);
	~FPSCamera();

public:
	void Update(double dt, InputHandler &ih);
	void SetProjection(T fovy, T aspect, T nnear, T nfar);
	glm::tmat4x4<T, P> UpdateProjection(glm::vec2 window_size_inv, int sample_max= TEMPORAL_JITTERING);
	void SetFov(T fovy);
	T GetFov();
	void SetAspect(T a);
	T GetAspect();

	glm::tmat4x4<T, P> GetViewToWorldMatrix();
	glm::tmat4x4<T, P> GetWorldToViewMatrix();
	glm::tmat4x4<T, P> GetClipToWorldMatrix();
	glm::tmat4x4<T, P> GetWorldToClipMatrix();
	glm::tmat4x4<T, P> GetClipToViewMatrix();
	glm::tmat4x4<T, P> GetViewToClipMatrix();
	glm::tmat4x4<T, P> GetWorldToClipMatrixUnjittered();

	glm::tvec3<T, P> GetClipToWorld(glm::tvec3<T, P> xyw);
	glm::tvec3<T, P> GetClipToView(glm::tvec3<T, P> xyw);

public:
	TRSTransform<T, P> mWorld;
	T mMovementSpeed;
	T mMouseSensitivity;

public:
	T mFov, mAspect, mNear, mFar;
	glm::tmat4x4<T, P> mProjection;
	glm::tmat4x4<T, P> mProjectionJitter;
	glm::tmat4x4<T, P> mProjectionInverse;
	glm::tvec3<T, P> mRotation;
	glm::tvec2<T, P> mMousePosition;
	int frameCount;
	bool jitterProjection = true;
	float jitterSpread = 1.7f;

public:
	friend std::ostream &operator<<(std::ostream &os, FPSCamera<T, P> &v) {
		os << v.mFov << " " << v.mAspect << " " << v.mNear << " " << v.mFar << std::endl;
		os << v.mMovementSpeed << " " << v.mMouseSensitivity << std::endl;
		os <<  v.mRotation.x << " " << v.mRotation.y << " " << v.mRotation.z << std::endl;
		for (size_t j = 0; j < 4; j++)
		{
			for (size_t i = 0; i < 4; i++)
			{
				os << v.mWorld.GetMatrix()[i][j] << " ";
			}
			if (j != 3)
			{
				os << std::endl;
			}
		}
		return os;
	}
	friend std::istream &operator>>(std::istream &is, FPSCamera<T, P> &v) {
		T fov, aspect, nnear, far;
		is >> fov >> aspect >> nnear >> far;
		v.SetProjection(fov, aspect, nnear, far);
		is >> v.mMovementSpeed >> v.mMouseSensitivity;
		is >> v.mRotation.x >> v.mRotation.y >> v.mRotation.z;
		for (size_t j = 0; j < 4; j++)
		{
			for (size_t i = 0; i < 4; i++)
			{
				is >> v.mWorld.GetMatrix()[i][j];
			}
		}
		return is;
	}
};

#include "FPSCamera.inl"

typedef FPSCamera<float, glm::defaultp> FPSCameraf;
typedef FPSCamera<double, glm::defaultp> FPSCamerad;
